import type {
  OrganizeItemRecord,
  OrganizeItemStatus,
} from '@/shared/eagle/organize'
import type { OrganizeTaskRecord } from './storage'

export interface ItemStatusChange {
  from?: OrganizeItemStatus
  to: OrganizeItemStatus
}

type TaskEvent =
  | { type: 'pause'; reason: OrganizeTaskRecord['pausedReason'] }
  | { type: 'resume' }
  | { type: 'append'; itemIds: string[] }
  | { type: 'items-changed'; changes: ItemStatusChange[]; resume?: boolean }
  | { type: 'keep-successful'; itemIds: string[] }
  | { type: 'finalize'; items: OrganizeProgressItem[] }

export type OrganizeProgressItem = Pick<
  OrganizeItemRecord,
  'itemId' | 'status' | 'title'
>

const isExecuted = (status?: OrganizeItemStatus) =>
  !!status && status !== 'pending'

/** 确认阶段仍可能有失败待处理；只有队列、待确认和失败项都清空才结束。 */
const settle = (task: OrganizeTaskRecord): OrganizeTaskRecord => {
  if (task.phase !== 'confirming' && task.phase !== 'done') return task
  if (task.executed < task.itemIds.length) {
    return { ...task, phase: 'running', pausedReason: null }
  }
  return {
    ...task,
    phase:
      task.pendingConfirm > 0 || task.failedCount > 0 ? 'confirming' : 'done',
    pausedReason: null,
  }
}

/** 任务计数和阶段的唯一转换入口。纯计算，调用方在 mutateTask 内应用。 */
export const transitionTask = (
  task: OrganizeTaskRecord,
  event: TaskEvent,
): OrganizeTaskRecord | null => {
  switch (event.type) {
    case 'pause':
      return task.phase === 'running'
        ? { ...task, phase: 'paused', pausedReason: event.reason }
        : null
    case 'resume':
      return task.phase === 'paused'
        ? { ...task, phase: 'running', pausedReason: null }
        : null
    case 'append':
      return {
        ...task,
        itemIds: [...task.itemIds, ...event.itemIds],
        phase: task.phase === 'confirming' ? 'running' : task.phase,
      }
    case 'items-changed': {
      const next = { ...task }
      for (const { from, to } of event.changes) {
        if (from === to) continue
        next.executed += Number(isExecuted(to)) - Number(isExecuted(from))
        next.pendingConfirm +=
          Number(to === 'success') - Number(from === 'success')
        next.failedCount += Number(to === 'failed') - Number(from === 'failed')
        // 成功计数包含已确认/跳过的成功项，仅重新执行时撤回上一轮成功。
        if (to === 'success') next.successCount++
        if (from === 'success' && to === 'pending') next.successCount--
      }
      next.executed = Math.max(0, next.executed)
      next.pendingConfirm = Math.max(0, next.pendingConfirm)
      next.failedCount = Math.max(0, next.failedCount)
      next.successCount = Math.max(0, next.successCount)
      if (event.resume) {
        next.phase = 'running'
        next.pausedReason = null
      }
      return settle(next)
    }
    case 'keep-successful':
      return task.phase === 'paused'
        ? {
            ...task,
            phase: 'confirming',
            pausedReason: null,
            itemIds: event.itemIds,
            executed: event.itemIds.length,
            pendingConfirm: event.itemIds.length,
            successCount: event.itemIds.length,
            failedCount: 0,
          }
        : null
    case 'finalize': {
      if (task.phase !== 'running') return null
      const items = new Map(event.items.map((item) => [item.itemId, item]))
      let pendingConfirm = 0
      let successCount = 0
      let failedCount = 0
      for (const id of task.itemIds) {
        const item = items.get(id)
        if (!item || item.status === 'pending') return null
        if (item.status === 'success') pendingConfirm++
        if (item.status === 'failed') failedCount++
        if (
          item.status === 'success' ||
          item.status === 'confirmed' ||
          (item.status === 'skipped' && item.title !== undefined)
        )
          successCount++
      }
      return settle({
        ...task,
        phase: 'confirming',
        executed: task.itemIds.length,
        pendingConfirm,
        successCount,
        failedCount,
      })
    }
  }
}
