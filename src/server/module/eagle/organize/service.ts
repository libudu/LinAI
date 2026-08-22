import type {
  OrganizeItemStatus,
  OrganizePrepareResp,
  OrganizeQueueItem,
  OrganizeQueueItemState,
  OrganizeQueueResp,
  OrganizeResultDetail,
  OrganizeResultListItem,
  OrganizeStatus,
  OrganizeTaskView,
} from '@/shared/eagle/organize'
import type { EagleSortBy, EagleSortOrder } from '@/shared/eagle/types'
import { changeBus } from '../../../common/storage/change-bus'
import {
  folderExists,
  getClassifiableItems,
  getFolderStandards,
  getItemEntry,
  updateItem,
} from '../library'
import { ORGANIZE_RESOURCE } from './constants'
import { organizeExecutor } from './executor'
import { organizeRepository, type OrganizeTaskRecord } from './storage'

/**
 * 图片整理任务服务：任务生命周期（创建/暂停/恢复）、结果读取与变更事件发布。
 * 持久化由 OrganizeRepository 负责；所有状态变更必须经由本服务，
 * 队列推进由 OrganizeExecutor 在后台完成（创建/恢复时 kick）。
 */

export interface OrganizePrepareParams {
  folderId?: string
  sortBy: EagleSortBy
  sortOrder: EagleSortOrder
}

export interface OrganizeCreateTaskParams extends OrganizePrepareParams {
  count: number
  compress: boolean
  /** 队列执行并发数（1~10，创建时固化到任务） */
  concurrency: number
}

export type CreateTaskResult =
  | { ok: true; task: OrganizeTaskView }
  | { ok: false; status: 400 | 409; error: string }

/** 确认 / 不处理 / 重新执行的结果动作 */
export type OrganizeActionResult =
  | { ok: true }
  | { ok: false; status: 404 | 409; error: string }

const toTaskView = (record: OrganizeTaskRecord): OrganizeTaskView => ({
  phase: record.phase,
  pausedReason: record.pausedReason,
  compress: record.compress,
  concurrency: record.concurrency,
  createdAt: record.createdAt,
  standards: record.standards,
  total: record.itemIds.length,
  executed: record.executed,
  pendingConfirm: record.pendingConfirm,
  successCount: record.successCount,
  failedCount: record.failedCount,
})

class OrganizeService {
  private readonly ready: Promise<void>

  constructor() {
    // 登记为可订阅的变更资源（/api/storage/events?resources=eagle.organize）
    changeBus.register(ORGANIZE_RESOURCE)
    this.ready = this.recoverInterruptedTask()
  }

  /** 服务重启后，正在执行的任务标记为已暂停（请求中断，in-flight 结果未落盘） */
  private async recoverInterruptedTask(): Promise<void> {
    try {
      const task = await organizeRepository.getTask()
      if (task && task.phase === 'running') {
        await organizeRepository.saveTask({
          ...task,
          phase: 'paused',
          pausedReason: 'restart',
        })
        this.publishChange()
      }
    } catch (error) {
      console.error('[Eagle] 图片整理任务启动恢复失败', error)
    }
  }

  private publishChange(): void {
    changeBus.publish({ resource: ORGANIZE_RESOURCE })
  }

  /** 徽标用轻量状态；无任务返回 null */
  async getStatus(): Promise<OrganizeStatus | null> {
    await this.ready
    const task = await organizeRepository.getTask()
    if (!task) return null
    return {
      phase: task.phase,
      remaining: task.itemIds.length - task.executed,
      pendingConfirm: task.pendingConfirm,
      pausedReason: task.pausedReason,
    }
  }

  async getTask(): Promise<OrganizeTaskView | null> {
    await this.ready
    const task = await organizeRepository.getTask()
    return task ? toTaskView(task) : null
  }

  /** 步骤 1 准备数据：分类标准 + 当前范围内可处理图片数 */
  async prepare(params: OrganizePrepareParams): Promise<OrganizePrepareResp> {
    await this.ready
    const [standards, items] = await Promise.all([
      getFolderStandards(),
      getClassifiableItems(params),
    ])
    return { standards, imageCount: items.total }
  }

  async createTask(
    params: OrganizeCreateTaskParams,
  ): Promise<CreateTaskResult> {
    await this.ready
    const existing = await organizeRepository.getTask()
    if (existing && existing.phase !== 'done') {
      return {
        ok: false,
        status: 409,
        error: '当前仍有未完成的整理任务，请先处理或等待完成',
      }
    }
    const standards = await getFolderStandards()
    if (standards.length === 0) {
      return {
        ok: false,
        status: 400,
        error: '没有包含描述的文件夹，请先在文件夹编辑中填写描述作为分类标准',
      }
    }
    const { total, itemIds } = await getClassifiableItems(params)
    if (total === 0) {
      return { ok: false, status: 400, error: '当前范围内没有可处理的图片' }
    }
    const record: OrganizeTaskRecord = {
      phase: 'running',
      pausedReason: null,
      compress: params.compress,
      concurrency: params.concurrency,
      createdAt: Date.now(),
      standards,
      itemIds: itemIds.slice(0, Math.min(params.count, total)),
      executed: 0,
      pendingConfirm: 0,
      successCount: 0,
      failedCount: 0,
    }
    // 旧任务已结束（或无任务）：清空旧结果后落盘新任务
    await organizeRepository.clearItems()
    await organizeRepository.saveTask(record)
    this.publishChange()
    organizeExecutor.kick()
    return { ok: true, task: toTaskView(record) }
  }

  /** 用户暂停：停止派发新请求；返回 false 表示当前不可暂停 */
  async pauseTask(): Promise<boolean> {
    await this.ready
    organizeExecutor.stop()
    const updated = await organizeRepository.mutateTask((task) =>
      task.phase === 'running'
        ? { ...task, phase: 'paused', pausedReason: 'user' }
        : null,
    )
    if (!updated) return false
    this.publishChange()
    return true
  }

  async resumeTask(): Promise<boolean> {
    await this.ready
    const updated = await organizeRepository.mutateTask((task) =>
      task.phase === 'paused'
        ? { ...task, phase: 'running', pausedReason: null }
        : null,
    )
    if (!updated) return false
    this.publishChange()
    organizeExecutor.kick()
    return true
  }

  /**
   * 强制清空任务（步骤 2 红色按钮）：中断 in-flight 请求、丢弃任务与全部结果。
   * 先等执行器收尾再删数据，保证不会有过期结果在删除后落盘
   */
  async clearTask(): Promise<void> {
    await this.ready
    await organizeExecutor.abort()
    await organizeRepository.deleteTask()
    await organizeRepository.clearItems()
    this.publishChange()
  }

  /**
   * 执行中步骤的队列预览：按队列顺序返回执行中（执行器 in-flight）/ 待处理 /
   * 失败（附失败原因）的条目摘要；完成无误的项不返回（由结果确认步骤处理）。
   * total 为未完成总条数，items 截取前 limit 行
   */
  async getQueue(limit: number): Promise<OrganizeQueueResp> {
    await this.ready
    const task = await organizeRepository.getTask()
    if (!task) return { items: [], total: 0 }
    const results = await organizeRepository.listItems()
    const statusById = new Map(results.map((item) => [item.itemId, item.status]))
    const inFlight = new Set(organizeExecutor.getInFlightItemIds())

    const items: OrganizeQueueItem[] = []
    let total = 0
    for (const itemId of task.itemIds) {
      let state: OrganizeQueueItemState
      if (inFlight.has(itemId)) {
        state = 'processing'
      } else {
        const status = statusById.get(itemId)
        if (!status || status === 'pending') {
          state = 'pending'
        } else if (status === 'failed') {
          state = 'failed'
        } else {
          // success / skipped / confirmed：完成无误，交给结果确认步骤
          continue
        }
      }
      total++
      if (items.length >= limit) continue
      // 失败详情与条目名称只对要展示的行读取
      const error =
        state === 'failed'
          ? ((await organizeRepository.getItem(itemId))?.error ??
            '未知失败原因')
          : undefined
      const entry = await getItemEntry(itemId)
      items.push({ itemId, itemName: entry?.name ?? null, state, error })
    }
    return { items, total }
  }

  async listResults(
    status?: OrganizeItemStatus,
    options?: { offset?: number; limit?: number },
  ): Promise<OrganizeResultListItem[]> {
    await this.ready
    const items = await organizeRepository.listItems()
    let list = status ? items.filter((item) => item.status === status) : items
    // 列表按 updatedAt 倒序（EntityStore.list），offset/limit 在过滤后切片
    const { offset = 0, limit } = options ?? {}
    if (offset > 0) list = list.slice(offset)
    if (limit !== undefined && limit >= 0) list = list.slice(0, limit)
    return list
  }

  async getResult(itemId: string): Promise<OrganizeResultDetail | null> {
    await this.ready
    const record = await organizeRepository.getItem(itemId)
    if (!record) return null
    const entry = await getItemEntry(itemId)
    return { ...record, itemName: entry?.name ?? null }
  }

  /**
   * 确认结果：写 Eagle 库（移入目标文件夹，withTitle 决定是否同时改标题），状态 → confirmed。
   * 仅判定成功的结果有目标文件夹可写
   */
  async confirmItem(
    itemId: string,
    withTitle: boolean,
  ): Promise<OrganizeActionResult> {
    await this.ready
    const record = await organizeRepository.getItem(itemId)
    if (!record) return { ok: false, status: 404, error: '结果不存在' }
    if (record.status !== 'success') {
      return { ok: false, status: 409, error: '仅判定成功的结果可以确认' }
    }
    const task = await organizeRepository.getTask()
    const standard = task?.standards.find(
      (s) => s.folderPath === record.folderPath,
    )
    if (!standard) {
      return {
        ok: false,
        status: 409,
        error: '结果的分类文件夹已不在标准中，请重新执行后再确认',
      }
    }
    // 标准是任务创建时的快照，长任务期间文件夹可能已被删除，写库前按当前库校验
    if (!(await folderExists(standard.folderId))) {
      return {
        ok: false,
        status: 409,
        error: '目标文件夹已不存在（可能已被删除），请重新执行该图片后再确认',
      }
    }
    const updated = await updateItem(itemId, {
      folderId: standard.folderId,
      name: withTitle ? record.title : undefined,
    })
    if (!updated) return { ok: false, status: 404, error: 'Eagle 条目不存在' }
    await organizeRepository.saveItem({
      ...record,
      status: 'confirmed',
      updatedAt: Date.now(),
    })
    await this.settleAfterDecision()
    this.publishChange()
    return { ok: true }
  }

  /** 不处理：不做任何修改，状态 → skipped */
  async skipItem(itemId: string): Promise<OrganizeActionResult> {
    await this.ready
    const record = await organizeRepository.getItem(itemId)
    if (!record) return { ok: false, status: 404, error: '结果不存在' }
    if (record.status !== 'success' && record.status !== 'failed') {
      return { ok: false, status: 409, error: '该结果当前不需要确认' }
    }
    await organizeRepository.saveItem({
      ...record,
      status: 'skipped',
      updatedAt: Date.now(),
    })
    await this.settleAfterDecision()
    this.publishChange()
    return { ok: true }
  }

  /**
   * 重新执行单图：状态 → pending、phase → running（仅该图入队）。
   * attempts 与 executed 由执行器在真正执行时推进（executed 先减一回补），
   * 保证 remaining = total - executed 徽标语义。
   * 先改任务计数再落盘结果：后半步写盘失败时 kick 会经 finalize 以实体为准
   * 自愈回 confirming（旧结果仍在，计数被权威重算），不会卡死在 running
   */
  async retryItem(itemId: string): Promise<OrganizeActionResult> {
    await this.ready
    const record = await organizeRepository.getItem(itemId)
    if (!record) return { ok: false, status: 404, error: '结果不存在' }
    if (record.status !== 'success' && record.status !== 'failed') {
      return { ok: false, status: 409, error: '仅待确认的结果可以重新执行' }
    }
    await organizeRepository.mutateTask((task) => ({
      ...task,
      phase: 'running',
      pausedReason: null,
      pendingConfirm: Math.max(0, task.pendingConfirm - 1),
      executed: Math.max(0, task.executed - 1),
    }))
    try {
      await organizeRepository.saveItem({
        ...record,
        status: 'pending',
        updatedAt: Date.now(),
      })
    } finally {
      this.publishChange()
      organizeExecutor.kick()
    }
    return { ok: true }
  }

  /** 一张待确认结果处理完（确认 / 不处理）：待确认计数减一，全部处理完且非执行中 → done */
  private async settleAfterDecision(): Promise<void> {
    await organizeRepository.mutateTask((task) => {
      const pendingConfirm = Math.max(0, task.pendingConfirm - 1)
      if (task.phase === 'confirming' && pendingConfirm === 0) {
        return { ...task, pendingConfirm, phase: 'done', pausedReason: null }
      }
      return { ...task, pendingConfirm }
    })
  }
}

export const organizeService = new OrganizeService()
