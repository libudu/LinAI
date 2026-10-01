import type { OrganizeStatus } from '@/shared/eagle/organize'

export interface OptimisticItem {
  taskId: string
  state: 'queued' | 'submitting' | 'settled'
}

export type OptimisticItems = Record<string, OptimisticItem>

/** 展示计数由快照派生，服务端阶段始终保留。 */
export const deriveStatus = (
  serverStatus: OrganizeStatus | null,
  items: OptimisticItems,
) => {
  if (!serverStatus) return null
  const count = Object.values(items).filter(
    (item) => item.taskId === serverStatus.taskId,
  ).length
  return {
    ...serverStatus,
    pendingConfirm: Math.max(0, serverStatus.pendingConfirm - count),
  }
}

export const isEqualStatus = (
  a: OrganizeStatus | null,
  b: OrganizeStatus | null,
) =>
  a === b ||
  (!!a &&
    !!b &&
    a.taskId === b.taskId &&
    a.createdAt === b.createdAt &&
    a.phase === b.phase &&
    a.total === b.total &&
    a.remaining === b.remaining &&
    a.pendingConfirm === b.pendingConfirm &&
    a.failedCount === b.failedCount &&
    a.pausedReason === b.pausedReason)

/** 按任务轮次转换乐观记录，旧任务提交不能修改新任务的同名条目。 */
export const changeOptimisticItems = (
  items: OptimisticItems,
  ids: string[],
  taskId: string,
  nextState: OptimisticItem['state'] | null,
): OptimisticItems => {
  const next = { ...items }
  for (const id of ids) {
    if (next[id]?.taskId !== taskId) continue
    if (nextState === null) delete next[id]
    else next[id] = { ...next[id], state: nextState }
  }
  return next
}

export const reconcileOptimisticItems = (
  items: OptimisticItems,
  settledIds: string[],
  taskId: string | undefined,
): OptimisticItems => {
  const settled = new Set(settledIds)
  return Object.fromEntries(
    Object.entries(items).filter(
      ([id, item]) => !settled.has(id) && item.taskId === taskId,
    ),
  )
}
