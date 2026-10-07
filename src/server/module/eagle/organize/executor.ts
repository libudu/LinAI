import type {
  OrganizeClassificationMode,
  OrganizeFolderStandard,
  OrganizeItemRecord,
} from '@/shared/eagle/organize'
import { sendWindowsNotification } from '../../../common/notify'
import { changeBus } from '../../../common/storage/change-bus'
import { updateItem } from '../library'
import { getEagleVisionEndpoint } from '../settings'
import {
  ERROR_PAUSE_THRESHOLD,
  ORGANIZE_RESOURCE,
  REQUEST_INTERVAL_MS,
} from './constants'
import { prepareConfirmation } from './service/confirmation'
import { organizeRepository } from './storage'
import { transitionTask } from './transitions'
import { judgeItem } from './vision'

/**
 * 整理队列执行器：按队列顺序以任务指定的并发数派发视觉判定。
 * - 单图连续失败达到 10 次后停止派发（任意一次成功后重头计数），in-flight 请求继续完成并落盘
 * - 全部执行过一遍后 phase → confirming（有待确认/失败）/ done（全部处理完毕）
 * - 由 service 在任务创建 / 恢复时 kick；用户暂停与失败停止都只停派发
 * - 强制清空（abort）：epoch 递增 + AbortController 中断 in-flight 上游请求，
 *   过期轮次的结果不再落盘，也不会在收尾时重启队列
 * 队列推进在服务端后台进行，不依赖前端在线。
 */
class OrganizeExecutor {
  /** 连续失败计数：任意一次成功重置为 0，连续达到 10 次时暂停队列 */
  private consecutiveErrors = 0
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
  /** 全部并发 lane 共用的派发闸门，保证相邻视觉请求不会同时发起 */
  private dispatchGate: Promise<void> = Promise.resolve()
  /** 最近一次视觉请求开始执行的时间 */
  private lastDispatchAt = 0

  /** 开始（或继续）执行队列；已在执行时仅清除停止标记 */
  kick(): void {
    this.consecutiveErrors = 0
    if (this.active) {
      this.stopping = false
      return
    }
    this.active = true
    this.stopping = false
    const epoch = ++this.epoch
    const controller = new AbortController()
    this.abortController = controller
    let completedNormally = false
    const promise = this.runQueue(epoch, controller.signal)
      .then(() => {
        completedNormally = true
      })
      .catch((error) => console.error('[Eagle] 图片整理队列执行异常', error))
      .finally(async () => {
        this.active = false
        if (this.abortController === controller) this.abortController = null
        if (this.runPromise === promise) this.runPromise = null
        if (!completedNormally || epoch !== this.epoch) return
        // 收尾期间可能收到追加或恢复请求，kick 当时因 active 而没有启动新轮次。
        try {
          const latest = await organizeRepository.getTask()
          if (epoch === this.epoch && latest?.phase === 'running') this.kick()
        } catch (error) {
          console.error('[Eagle] 图片整理队列收尾检查失败', error)
        }
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
    this.consecutiveErrors = 0
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
    const { itemIds, standards, compress, concurrency, classificationMode } =
      task

    // 恢复场景：跳过已有结果且非 pending 的前缀，得到下一个待派发位置。
    // 派发严格按序，已完成的结果实体必然构成前缀（in-flight 未落盘的项会被重新执行）
    const statuses = await organizeRepository.getItemStatuses()
    const done = new Set(
      itemIds.filter((id) => {
        const status = statuses.get(id)
        return (
          status !== undefined &&
          status !== 'pending' &&
          !(classificationMode === 'recursive-rename' && status === 'success')
        )
      }),
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
          const canDispatch = await this.waitForDispatch(epoch, signal)
          if (!canDispatch) return
          this.inFlight.add(itemId)
          try {
            await this.processItem(itemId, {
              compress,
              standards,
              classificationMode,
              epoch,
              signal,
            })
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
    const latestStatuses = await organizeRepository.getItemStatuses()
    if (
      latest.itemIds.some((id) => {
        const status = latestStatuses.get(id)
        return (
          status === undefined ||
          status === 'pending' ||
          (latest.classificationMode === 'recursive-rename' &&
            status === 'success')
        )
      })
    ) {
      this.stopping = false
      return this.runQueue(epoch, signal)
    }
    const finalized = await this.finalize()
    if (!finalized) return this.runQueue(epoch, signal)
  }

  /** 串行分配请求启动时隙，使全局相邻两次派发至少间隔 0.5 秒 */
  private async waitForDispatch(
    epoch: number,
    signal: AbortSignal,
  ): Promise<boolean> {
    let release = () => {}
    const previous = this.dispatchGate
    this.dispatchGate = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous
    try {
      if (this.stopping || epoch !== this.epoch || signal.aborted) return false
      const delay = Math.max(
        0,
        this.lastDispatchAt + REQUEST_INTERVAL_MS - Date.now(),
      )
      if (delay > 0) await this.waitForDelay(delay, signal)
      if (this.stopping || epoch !== this.epoch || signal.aborted) return false
      this.lastDispatchAt = Date.now()
      return true
    } finally {
      release()
    }
  }

  /** 强制清空时提前结束尚未取得派发时隙的等待 */
  private waitForDelay(delay: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timeout)
        signal.removeEventListener('abort', finish)
        resolve()
      }
      const timeout = setTimeout(finish, delay)
      signal.addEventListener('abort', finish, { once: true })
      if (signal.aborted) finish()
    })
  }

  /** 执行单个条目：判定 → 落盘结果 → 更新任务计数；连续 10 次失败后暂停派发（任意一次成功后重头计数） */
  private async processItem(
    itemId: string,
    options: {
      compress: boolean
      standards: OrganizeFolderStandard[]
      classificationMode: OrganizeClassificationMode
      epoch: number
      signal: AbortSignal
    },
  ): Promise<void> {
    const previous = await organizeRepository.getItem(itemId)
    const attempts = (previous?.attempts ?? 0) + 1
    let record: OrganizeItemRecord
    try {
      // 保留的成功结果可在服务重启后继续写库，无需重复请求模型。
      const outcome =
        options.classificationMode === 'recursive-rename' &&
        previous?.status === 'success'
          ? previous
          : await judgeItem(itemId, options)
      record = {
        itemId,
        status: 'success',
        needsRename: outcome.needsRename,
        title: outcome.title,
        folderPaths: outcome.folderPaths,
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
    let didPauseOnError = false
    await organizeRepository.mutateTask(async (task) => {
      if (options.epoch !== this.epoch) return null
      if (
        task.classificationMode === 'recursive-rename' &&
        record.status === 'success'
      ) {
        // 先保存建议标题，写库或最终状态落盘中断时可恢复；仅成功写库后计为已确认。
        await organizeRepository.saveItem(record)
        try {
          const endpoint = await getEagleVisionEndpoint()
          const plan = await prepareConfirmation(
            { itemId, folderPath: '未分类', withTitle: true },
            task.standards,
            endpoint.modelId,
            task.classificationMode,
          )
          if (options.epoch !== this.epoch) return null
          if (plan.kind === 'resolved') {
            if (!plan.result.ok) throw new Error(plan.result.error)
          } else if (plan.kind === 'ready' && plan.patch.name !== undefined) {
            if (!(await updateItem(itemId, plan.patch)))
              throw new Error('Eagle 条目不存在')
          }
          record = { ...record, status: 'confirmed', updatedAt: Date.now() }
        } catch (error) {
          record = {
            itemId,
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
            attempts,
            updatedAt: Date.now(),
          }
        }
      }
      if (options.epoch !== this.epoch) return null
      await organizeRepository.saveItem(record)
      if (record.status === 'success' || record.status === 'confirmed') {
        this.consecutiveErrors = 0
      } else if (record.status === 'failed') {
        this.consecutiveErrors++
      }

      const isFailed = record.status === 'failed'
      const shouldPause =
        isFailed &&
        this.consecutiveErrors >= ERROR_PAUSE_THRESHOLD &&
        task.phase === 'running'

      const next = transitionTask(task, {
        type: 'items-changed',
        changes:
          record.status === 'confirmed'
            ? [
                { from: previous?.status, to: 'success' },
                { from: 'success', to: 'confirmed' },
              ]
            : [{ from: previous?.status, to: record.status }],
      })!
      if (shouldPause) {
        didPauseOnError = true
        return transitionTask(next, { type: 'pause', reason: 'error' })
      }
      return next
    })
    if (didPauseOnError) {
      this.stopping = true
      sendWindowsNotification(
        'LinAI 图片整理',
        `图片整理队列因连续失败达到 ${ERROR_PAUSE_THRESHOLD} 次已自动暂停，请检查原因`,
      )
    }
    changeBus.publish({ resource: ORGANIZE_RESOURCE })
  }

  /**
   * 全部执行过一遍：以结果实体为准重算任务计数（计数可能因写盘异常与实体脱节），
   * 有待确认/失败 → confirming，否则 → done。在任务串行更新内读取最新结果快照。
   */
  private async finalize(): Promise<boolean> {
    const updated = await organizeRepository.mutateTask(async (task) =>
      transitionTask(task, {
        type: 'finalize',
        items: await organizeRepository.getProgressItems(),
      }),
    )
    if (updated) {
      this.consecutiveErrors = 0
      changeBus.publish({ resource: ORGANIZE_RESOURCE })
      if (updated.executed > 0) {
        if (updated.failedCount === 0) {
          sendWindowsNotification(
            'LinAI 图片整理',
            updated.classificationMode === 'recursive-rename'
              ? `图片重命名完成（共 ${updated.successCount} 张），已直接修改文件名`
              : `全部图片处理完成（共 ${updated.executed} 张），请前往查验结果`,
          )
        } else {
          sendWindowsNotification(
            'LinAI 图片整理',
            `图片处理完成：${updated.successCount} 张成功，${updated.failedCount} 张失败`,
          )
        }
      }
    }
    return updated !== null
  }

  private async pauseAs(reason: 'error'): Promise<void> {
    let didPause = false
    await organizeRepository.mutateTask((task) => {
      if (task.phase === 'running') {
        didPause = true
        return transitionTask(task, { type: 'pause', reason })
      }
      return null
    })
    if (didPause) {
      sendWindowsNotification(
        'LinAI 图片整理',
        '图片整理队列因异常已自动暂停，请检查',
      )
    }
    changeBus.publish({ resource: ORGANIZE_RESOURCE })
  }
}

export const organizeExecutor = new OrganizeExecutor()
