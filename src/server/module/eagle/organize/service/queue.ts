import type {
  OrganizeFailedItem,
  OrganizeQueueItem,
  OrganizeQueueItemState,
  OrganizeQueueResp,
} from '@/shared/eagle/organize'
import { getItemSnapshots } from '../../library'
import { organizeExecutor } from '../executor'
import { organizeRepository } from '../storage'
import { transitionTask, type ItemStatusChange } from '../transitions'
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
      items.push({ itemId, itemName: null, state, error })
    }
    const itemMap = await getItemSnapshots(items.map((item) => item.itemId))
    for (const item of items)
      item.itemName = itemMap?.get(item.itemId)?.name ?? null
    return { items, total }
  }

  async listFailedItems(): Promise<OrganizeFailedItem[]> {
    const items = await organizeRepository.listItems()
    const failed = items.filter((item) => item.status === 'failed')
    const itemMap = await getItemSnapshots(failed.map((item) => item.itemId))
    const result = await Promise.all(
      failed.map(async (item) => {
        const record = await organizeRepository.getItem(item.itemId)
        const entry = itemMap?.get(item.itemId)
        return {
          itemId: item.itemId,
          itemName: entry?.name ?? null,
          error: record?.error ?? '未知错误',
          updatedAt: item.updatedAt,
        }
      }),
    )
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

    await organizeRepository.mutateTask(async (latest) => {
      const changes: ItemStatusChange[] = []
      for (const itemId of failedIds) {
        const record = await organizeRepository.getItem(itemId)
        if (!record || record.status !== 'failed') continue
        await organizeRepository.saveItem({
          ...record,
          status: 'pending',
          updatedAt: Date.now(),
        })
        changes.push({ from: record.status, to: 'pending' })
      }
      return transitionTask(latest, {
        type: 'items-changed',
        changes,
        resume: true,
      })
    })
    publishOrganizeChange()
    organizeExecutor.kick()

    return { ok: true }
  }

  /** 步骤 2 批量跳过所有失败项 */
  async skipFailedItems(): Promise<OrganizeActionResult> {
    const items = await organizeRepository.listItems()
    const failedItems = items.filter((item) => item.status === 'failed')
    if (failedItems.length === 0) return { ok: true }
    await organizeRepository.mutateTask(async (latest) => {
      const changes: ItemStatusChange[] = []
      for (const item of failedItems) {
        const record = await organizeRepository.getItem(item.itemId)
        if (record && record.status === 'failed') {
          await organizeRepository.saveItem({
            ...record,
            status: 'skipped',
            updatedAt: Date.now(),
          })
          changes.push({ from: record.status, to: 'skipped' })
        }
      }
      return transitionTask(latest, {
        type: 'items-changed',
        changes,
      })
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

    const updated = await organizeRepository.mutateTask(async (latest) => {
      if (latest.phase !== 'paused') return null
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
      return transitionTask(latest, {
        type: 'keep-successful',
        itemIds: successIds,
      })
    })
    if (!updated) {
      return { ok: false, status: 409, error: '任务当前不在暂停状态' }
    }
    publishOrganizeChange()
    return { ok: true }
  }
}

export const queueService = new QueueService()
