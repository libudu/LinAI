import type {
  OrganizeFolderStandard,
  OrganizeItemRecord,
  OrganizeItemStatus,
} from '@/shared/eagle/organize'
import { changeBus } from '../../../common/storage/change-bus'
import { ORGANIZE_RESOURCE } from './constants'
import { organizeRepository } from './storage'
import { judgeItem } from './vision'

/**
 * 整理队列执行器：按队列顺序以任务指定的并发数派发视觉判定。
 * - 单图失败累计达到 3 次后停止派发，in-flight 请求继续完成并落盘
 * - 全部执行过一遍后 phase → confirming（有待确认）/ done（无待确认）
 * - 由 service 在任务创建 / 恢复时 kick；用户暂停与失败停止都只停派发
 * - 强制清空（abort）：epoch 递增 + AbortController 中断 in-flight 上游请求，
 *   过期轮次的结果不再落盘，也不会在收尾时重启队列
 * 队列推进在服务端后台进行，不依赖前端在线。
 */
class OrganizeExecutor {
  private static readonly ERROR_PAUSE_THRESHOLD = 3
  /** runQueue 是否在执行中（kick 的幂等依据） */
  private active = false
  /** 停止派发标记（用户暂停 / 单图失败 / 结果落盘异常 / 强制清空） */
  private stopping = false
  /** 执行轮次标识：kick 与 abort 各递增一次，用于丢弃过期轮次的结果与收尾 */
  private epoch = 0
  /** 当前轮次的中断控制器（清空任务时中断 in-flight 上游请求） */
  private abortController: AbortController | null = null
  /** 当前轮次的执行 Promise（abort 时等待 in-flight 收尾） */
  private runPromise: Promise<void> | null = null
  /** 正在执行视觉判定的条目（队列预览展示用） */
  private readonly inFlight = new Set<string>()

  /** 开始（或继续）执行队列；已在执行时仅清除停止标记 */
  kick(): void {
    if (this.active) {
      this.stopping = false
      return
    }
    this.active = true
    this.stopping = false
    const epoch = ++this.epoch
    const controller = new AbortController()
    this.abortController = controller
    const promise = this.runQueue(epoch, controller.signal)
      .catch((error) => console.error('[Eagle] 图片整理队列执行异常', error))
      .finally(() => {
        this.active = false
        if (this.abortController === controller) this.abortController = null
        if (this.runPromise === promise) this.runPromise = null
      })
    this.runPromise = promise
  }

  /** 停止派发新请求，正在发送的请求不受影响；任务状态由 service / 执行器落盘 */
  stop(): void {
    this.stopping = true
  }

  /** 等待当前轮次的 in-flight 请求全部落盘，供暂停状态下调整队列使用 */
  async waitForIdle(): Promise<void> {
    await this.runPromise
  }

  /**
   * 强制清空：停止派发并中断 in-flight 上游请求，等待当前轮次完全收尾
   * （过期轮次的结果被丢弃），之后由 service 删除任务与结果
   */
  async abort(): Promise<void> {
    this.stopping = true
    this.epoch++
    this.abortController?.abort()
    await this.runPromise
  }

  /** 队列预览用：正在执行视觉判定的条目 id 快照 */
  getInFlightItemIds(): string[] {
    return [...this.inFlight]
  }

  private async runQueue(epoch: number, signal: AbortSignal): Promise<void> {
    const task = await organizeRepository.getTask()
    if (!task || task.phase !== 'running') return
    const { itemIds, standards, compress, concurrency } = task

    // 恢复场景：跳过已有结果且非 pending 的前缀，得到下一个待派发位置。
    // 派发严格按序，已完成的结果实体必然构成前缀（in-flight 未落盘的项会被重新执行）
    const executedItems = await organizeRepository.listItems()
    const done = new Set(
      executedItems
        .filter((item) => item.status !== 'pending')
        .map((item) => item.itemId),
    )
    let cursor = 0
    while (cursor < itemIds.length && done.has(itemIds[cursor])) cursor++

    const lanes = Array.from(
      { length: Math.min(concurrency, itemIds.length - cursor) },
      async () => {
        for (;;) {
          if (this.stopping) return
          const index = cursor++
          if (index >= itemIds.length) return
          const itemId = itemIds[index]
          // 「重新执行」会在已完成的前缀中间挖出 pending 项，其后已完成的项直接跳过
          if (done.has(itemId)) continue
          this.inFlight.add(itemId)
          try {
            await this.processItem(itemId, { compress, standards, epoch, signal })
          } catch (error) {
            // 结果落盘等基础设施异常：暂停队列，避免计数与实体脱节
            console.error('[Eagle] 图片整理结果落盘失败，队列暂停', error)
            this.stopping = true
            await this.pauseAs('error')
            return
          } finally {
            this.inFlight.delete(itemId)
          }
        }
      },
    )
    await Promise.all(lanes)

    // 强制清空后的过期轮次：不收尾、不重启队列
    if (epoch !== this.epoch) return

    // 派发结束：任务仍在 running 说明队列可能「排空期间被恢复」（kick 幂等返回）。
    // 是否重拉以实体状态为准（存在 pending 或未落盘项）而非 executed 计数——
    // 计数可能因写盘异常与实体脱节，按计数判断会无限重拉
    const latest = await organizeRepository.getTask()
    if (!latest || latest.phase !== 'running') return
    const itemsAfter = await organizeRepository.listItems()
    const settled = new Set(
      itemsAfter
        .filter((item) => item.status !== 'pending')
        .map((item) => item.itemId),
    )
    if (latest.itemIds.some((id) => !settled.has(id))) {
      this.stopping = false
      return this.runQueue(epoch, signal)
    }
    await this.finalize(itemsAfter)
  }

  /** 执行单个条目：判定 → 落盘结果 → 更新任务计数；累计 3 次失败后暂停派发 */
  private async processItem(
    itemId: string,
    options: {
      compress: boolean
      standards: OrganizeFolderStandard[]
      epoch: number
      signal: AbortSignal
    },
  ): Promise<void> {
    const previous = await organizeRepository.getItem(itemId)
    const attempts = (previous?.attempts ?? 0) + 1
    let record: OrganizeItemRecord
    try {
      const outcome = await judgeItem(itemId, options)
      record = {
        itemId,
        status: 'success',
        title: outcome.title,
        folderPath: outcome.folderPath,
        lowQuality: outcome.lowQuality,
        attempts,
        updatedAt: Date.now(),
      }
    } catch (error) {
      record = {
        itemId,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        attempts,
        updatedAt: Date.now(),
      }
    }
    // 强制清空（epoch 已变）后丢弃过期结果，不再落盘
    if (options.epoch !== this.epoch) return
    await organizeRepository.saveItem(record)
    const updated = await organizeRepository.mutateTask((task) => {
      const next = {
        ...task,
        executed: task.executed + 1,
        pendingConfirm:
          task.pendingConfirm +
          (record.status === 'success' || record.status === 'failed' ? 1 : 0),
        successCount: task.successCount + (record.status === 'success' ? 1 : 0),
        failedCount: task.failedCount + (record.status === 'failed' ? 1 : 0),
      }
      if (
        record.status === 'failed' &&
        next.failedCount >= OrganizeExecutor.ERROR_PAUSE_THRESHOLD &&
        next.phase === 'running'
      ) {
        next.phase = 'paused'
        next.pausedReason = 'error'
      }
      return next
    })
    if (record.status === 'failed' && updated?.phase === 'paused') {
      this.stopping = true
    }
    changeBus.publish({ resource: ORGANIZE_RESOURCE })
  }

  /**
   * 全部执行过一遍：以结果实体为准重算任务计数（计数可能因写盘异常与实体脱节），
   * 有待确认 → confirming，否则 → done。复用调用方已取的实体列表避免重复全量扫描
   */
  private async finalize(
    items: Array<{ itemId: string; status: OrganizeItemStatus }>,
  ): Promise<void> {
    const updated = await organizeRepository.mutateTask((task) => {
      if (task.phase !== 'running') return null
      const statusById = new Map(
        items.map((item) => [item.itemId, item.status]),
      )
      let executed = 0
      let pendingConfirm = 0
      let successCount = 0
      let failedCount = 0
      for (const itemId of task.itemIds) {
        const status = statusById.get(itemId)
        // 未落盘（不应发生）与 pending 均不计入已完成
        if (!status || status === 'pending') continue
        executed++
        if (status === 'success') {
          pendingConfirm++
          successCount++
        } else if (status === 'failed') {
          pendingConfirm++
          failedCount++
        }
      }
      return {
        ...task,
        executed,
        pendingConfirm,
        successCount,
        failedCount,
        phase: pendingConfirm > 0 ? 'confirming' : 'done',
        pausedReason: null,
      }
    })
    if (updated) changeBus.publish({ resource: ORGANIZE_RESOURCE })
  }

  private async pauseAs(reason: 'error'): Promise<void> {
    await organizeRepository.mutateTask((task) =>
      task.phase === 'running'
        ? { ...task, phase: 'paused', pausedReason: reason }
        : null,
    )
    changeBus.publish({ resource: ORGANIZE_RESOURCE })
  }
}

export const organizeExecutor = new OrganizeExecutor()
