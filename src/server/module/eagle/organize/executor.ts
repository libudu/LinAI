import type {
  OrganizeFolderStandard,
  OrganizeItemRecord,
  OrganizeItemStatus,
} from '@/shared/eagle/organize'
import { changeBus } from '../../../common/storage/change-bus'
import { EXECUTOR_CONCURRENCY, ORGANIZE_RESOURCE } from './constants'
import { organizeRepository } from './storage'
import { judgeItem } from './vision'

/**
 * 整理队列执行器：按队列顺序以 5 并发派发视觉判定。
 * - 单图失败（含上游错误 / 非 JSON / 不属于任何分类）立即停止派发，in-flight 请求继续完成并落盘
 * - 全部执行过一遍后 phase → confirming（有待确认）/ done（无待确认）
 * - 由 service 在任务创建 / 恢复时 kick；用户暂停与失败停止都只停派发
 * 队列推进在服务端后台进行，不依赖前端在线。
 */
class OrganizeExecutor {
  /** runQueue 是否在执行中（kick 的幂等依据） */
  private active = false
  /** 停止派发标记（用户暂停 / 单图失败 / 结果落盘异常） */
  private stopping = false

  /** 开始（或继续）执行队列；已在执行时仅清除停止标记 */
  kick(): void {
    this.stopping = false
    if (this.active) return
    this.active = true
    this.runQueue()
      .catch((error) => console.error('[Eagle] 图片整理队列执行异常', error))
      .finally(() => {
        this.active = false
      })
  }

  /** 停止派发新请求，正在发送的请求不受影响；任务状态由 service / 执行器落盘 */
  stop(): void {
    this.stopping = true
  }

  private async runQueue(): Promise<void> {
    const task = await organizeRepository.getTask()
    if (!task || task.phase !== 'running') return
    const { itemIds, standards, compress } = task

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
      { length: Math.min(EXECUTOR_CONCURRENCY, itemIds.length - cursor) },
      async () => {
        for (;;) {
          if (this.stopping) return
          const index = cursor++
          if (index >= itemIds.length) return
          // 「重新执行」会在已完成的前缀中间挖出 pending 项，其后已完成的项直接跳过
          if (done.has(itemIds[index])) continue
          try {
            await this.processItem(itemIds[index], { compress, standards })
          } catch (error) {
            // 结果落盘等基础设施异常：暂停队列，避免计数与实体脱节
            console.error('[Eagle] 图片整理结果落盘失败，队列暂停', error)
            this.stopping = true
            await this.pauseAs('error')
            return
          }
        }
      },
    )
    await Promise.all(lanes)

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
      return this.runQueue()
    }
    await this.finalize(itemsAfter)
  }

  /** 执行单个条目：判定 → 落盘结果 → 更新任务计数；判定失败同时暂停派发 */
  private async processItem(
    itemId: string,
    options: { compress: boolean; standards: OrganizeFolderStandard[] },
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
    await organizeRepository.saveItem(record)
    await organizeRepository.mutateTask((task) => {
      const next = {
        ...task,
        executed: task.executed + 1,
        pendingConfirm:
          task.pendingConfirm +
          (record.status === 'success' || record.status === 'failed' ? 1 : 0),
        successCount: task.successCount + (record.status === 'success' ? 1 : 0),
        failedCount: task.failedCount + (record.status === 'failed' ? 1 : 0),
      }
      if (record.status === 'failed' && next.phase === 'running') {
        next.phase = 'paused'
        next.pausedReason = 'error'
      }
      return next
    })
    if (record.status === 'failed') this.stopping = true
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
