import type {
  OrganizeFailedItem,
  OrganizeQueueItem,
  OrganizeQueueItemState,
  OrganizeQueueResp,
} from '@/shared/eagle/organize'
import { getItemEntry } from '../../library'
import { organizeExecutor } from '../executor'
import { organizeRepository } from '../storage'
import { publishOrganizeChange } from './helpers'
import type { OrganizeActionResult } from './types'

export class QueueService {
  /**
   * 执行中步骤的队列预览：按队列顺序返回执行中（执行器 in-flight）/ 待处理 /
   * 失败（附失败原因）的条目摘要；完成无误的项不返回（由结果确认步骤处理）。
   * total 为未完成总条数，items 截取前 limit 行
   */
  async getQueue(limit: number): Promise<OrganizeQueueResp> {
    const task = await organizeRepository.getTask()
    if (!task) return { items: [], total: 0 }
    const results = await organizeRepository.listItems()
    const statusById = new Map(
      results.map((item) => [item.itemId, item.status]),
    )
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

  async listFailedItems(): Promise<OrganizeFailedItem[]> {
    const items = await organizeRepository.listItems()
    const failed = items.filter((item) => item.status === 'failed')
    const result: OrganizeFailedItem[] = []
    for (const item of failed) {
      const record = await organizeRepository.getItem(item.itemId)
      const entry = await getItemEntry(item.itemId)
      result.push({
        itemId: item.itemId,
        itemName: entry?.name ?? null,
        error: record?.error ?? '未知错误',
        updatedAt: item.updatedAt,
      })
    }
    return result.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  /** 把全部失败项重置为待处理并重新加入执行队列，然后继续/恢复执行 */
  async retryFailedItems(): Promise<OrganizeActionResult> {
    const task = await organizeRepository.getTask()
    if (!task) {
      return { ok: false, status: 404, error: '当前没有整理任务' }
    }
    const items = await organizeRepository.listItems()
    const taskItemSet = new Set(task.itemIds)
    const failedIds = items
      .filter(
        (item) => item.status === 'failed' && taskItemSet.has(item.itemId),
      )
      .map((item) => item.itemId)

    if (failedIds.length === 0) {
      return { ok: true }
    }

    const failedCount = failedIds.length
    await organizeRepository.mutateTask((latest) => ({
      ...latest,
      phase: 'running',
      pausedReason: null,
      executed: Math.max(0, latest.executed - failedCount),
      failedCount: Math.max(0, latest.failedCount - failedCount),
    }))

    try {
      for (const itemId of failedIds) {
        const record = await organizeRepository.getItem(itemId)
        if (!record || record.status !== 'failed') continue
        await organizeRepository.saveItem({
          ...record,
          status: 'pending',
          updatedAt: Date.now(),
        })
      }
    } finally {
      publishOrganizeChange()
      organizeExecutor.kick()
    }

    return { ok: true }
  }

  /** 步骤 2 批量跳过所有失败项 */
  async skipFailedItems(): Promise<OrganizeActionResult> {
    const items = await organizeRepository.listItems()
    const failedItems = items.filter((item) => item.status === 'failed')
    if (failedItems.length === 0) return { ok: true }
    for (const item of failedItems) {
      const record = await organizeRepository.getItem(item.itemId)
      if (record && record.status === 'failed') {
        await organizeRepository.saveItem({
          ...record,
          status: 'skipped',
          updatedAt: Date.now(),
        })
      }
    }
    await organizeRepository.mutateTask((latest) => {
      const next = {
        ...latest,
        failedCount: 0,
      }
      if (next.phase === 'confirming' && next.pendingConfirm === 0) {
        return { ...next, phase: 'done', pausedReason: null }
      }
      return next
    })
    publishOrganizeChange()
    return { ok: true }
  }

  /** 暂停状态下丢弃未处理与失败项，只保留成功结果进入分类确认 */
  async classifySuccessfulItems(): Promise<OrganizeActionResult> {
    const current = await organizeRepository.getTask()
    if (!current || current.phase !== 'paused') {
      return { ok: false, status: 409, error: '任务当前不在暂停状态' }
    }

    organizeExecutor.stop()
    await organizeExecutor.waitForIdle()
    const task = await organizeRepository.getTask()
    if (!task || task.phase !== 'paused') {
      return { ok: false, status: 409, error: '任务当前不在暂停状态' }
    }
    const items = await organizeRepository.listItems()
    const statusById = new Map(items.map((item) => [item.itemId, item.status]))
    const successIds = task.itemIds.filter(
      (itemId) => statusById.get(itemId) === 'success',
    )
    if (successIds.length === 0) {
      return { ok: false, status: 409, error: '当前没有成功执行的图片' }
    }

    for (const item of items) {
      if (item.status !== 'failed') continue
      const record = await organizeRepository.getItem(item.itemId)
      if (!record || record.status !== 'failed') continue
      await organizeRepository.saveItem({
        ...record,
        status: 'skipped',
        updatedAt: Date.now(),
      })
    }

    const updated = await organizeRepository.mutateTask((latest) =>
      latest.phase === 'paused'
        ? {
            ...latest,
            phase: 'confirming',
            pausedReason: null,
            itemIds: successIds,
            executed: successIds.length,
            pendingConfirm: successIds.length,
            successCount: successIds.length,
            failedCount: 0,
          }
        : null,
    )
    if (!updated) {
      return { ok: false, status: 409, error: '任务当前不在暂停状态' }
    }
    publishOrganizeChange()
    return { ok: true }
  }
}

export const queueService = new QueueService()
