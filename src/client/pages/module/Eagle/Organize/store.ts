import { subscribeStorageEvent } from '@/client/service/storage-events'
import type { OrganizeStatus } from '@/shared/eagle/organize'
import { useEffect } from 'react'
import { create } from 'zustand'
import { fetchOrganizeStatus } from './api'

interface OptimisticItem {
  taskCreatedAt: number
  state: 'queued' | 'submitting' | 'settled'
}

interface OrganizeState {
  /** 服务端快照不受本地操作修改 */
  serverStatus: OrganizeStatus | null
  /** 展示数量由服务端快照减去尚未校准的本地操作得出，phase 始终由服务端决定 */
  status: OrganizeStatus | null
  optimisticItems: Record<string, OptimisticItem>
  loaded: boolean
  /** 每次有效校准递增，结果列表可在数量未变化时重新拉取。 */
  revision: number
  subscriberCount: number
  unsubscribe: (() => void) | null
  addSubscriber: () => void
  removeSubscriber: () => void
}

const MIN_REFRESH_INTERVAL_MS = 3000
let fetchPromise: Promise<void> | null = null
let refreshRequested = false
let scheduledTimer: ReturnType<typeof setTimeout> | null = null
let lastFetchedAt = 0
let statusEpoch = 0
let refreshWaiters: Array<() => void> = []

const deriveStatus = (
  serverStatus: OrganizeStatus | null,
  optimisticItems: Record<string, OptimisticItem>,
) => {
  if (!serverStatus) return null
  const pendingCount = Object.values(optimisticItems).filter(
    (item) => item.taskCreatedAt === serverStatus.createdAt,
  ).length
  return {
    ...serverStatus,
    pendingConfirm: Math.max(0, serverStatus.pendingConfirm - pendingCount),
  }
}

const isEqualStatus = (a: OrganizeStatus | null, b: OrganizeStatus | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.createdAt === b.createdAt &&
    a.phase === b.phase &&
    a.total === b.total &&
    a.remaining === b.remaining &&
    a.pendingConfirm === b.pendingConfirm &&
    a.failedCount === b.failedCount &&
    a.pausedReason === b.pausedReason)

const hasSubmittingItems = () =>
  Object.values(useOrganizeStore.getState().optimisticItems).some(
    (item) => item.state === 'submitting',
  )

const clearScheduledRefresh = () => {
  if (scheduledTimer) clearTimeout(scheduledTimer)
  scheduledTimer = null
}

/** 提交期间只记脏；请求结果和快照校准之间不再接受过期状态。 */
const doFetchStatus = (): Promise<void> => {
  if (fetchPromise) return fetchPromise
  if (hasSubmittingItems()) {
    refreshRequested = true
    return Promise.resolve()
  }
  clearScheduledRefresh()
  refreshRequested = false
  const epoch = statusEpoch
  const settledIds = Object.entries(useOrganizeStore.getState().optimisticItems)
    .filter(([, item]) => item.state === 'settled')
    .map(([id]) => id)
  fetchPromise = fetchOrganizeStatus()
    .then((serverStatus) => {
      if (epoch !== statusEpoch) {
        refreshRequested = true
        return
      }
      lastFetchedAt = Date.now()
      useOrganizeStore.setState((state) => {
        const optimisticItems = { ...state.optimisticItems }
        for (const id of settledIds) delete optimisticItems[id]
        for (const [id, item] of Object.entries(optimisticItems)) {
          if (item.taskCreatedAt !== serverStatus?.createdAt)
            delete optimisticItems[id]
        }
        const stableServer = isEqualStatus(state.serverStatus, serverStatus)
          ? state.serverStatus
          : serverStatus
        return {
          serverStatus: stableServer,
          status: deriveStatus(stableServer, optimisticItems),
          optimisticItems,
          loaded: true,
          revision: state.revision + 1,
        }
      })
      const waiters = refreshWaiters
      refreshWaiters = []
      for (const resolve of waiters) resolve()
    })
    .catch((error) => {
      console.error('拉取图片整理任务状态失败', error)
      useOrganizeStore.setState({ loaded: true })
      const waiters = refreshWaiters
      refreshWaiters = []
      for (const resolve of waiters) resolve()
      // 已提交项保留乐观记录，下一次成功校准后才移除，避免失败时重复扣减。
      if (settledIds.length > 0) scheduleThrottledRefresh()
    })
    .finally(() => {
      fetchPromise = null
      if (refreshRequested && !hasSubmittingItems()) void doFetchStatus()
    })
  return fetchPromise
}

const scheduleThrottledRefresh = () => {
  if (hasSubmittingItems()) {
    refreshRequested = true
    return
  }
  if (scheduledTimer) return
  const delay = Math.max(
    0,
    MIN_REFRESH_INTERVAL_MS - (Date.now() - lastFetchedAt),
  )
  scheduledTimer = setTimeout(
    () => {
      scheduledTimer = null
      void doFetchStatus()
    },
    delay || (fetchPromise ? MIN_REFRESH_INTERVAL_MS : 0),
  )
}

/** 返回实际校准完成的 Promise；单飞期间的调用也会等待同一轮有效结果。 */
export const refreshOrganizeStatus = (): Promise<void> => {
  clearScheduledRefresh()
  refreshRequested = true
  return new Promise((resolve) => {
    refreshWaiters.push(resolve)
    void doFetchStatus()
  })
}

const useOrganizeStore = create<OrganizeState>((set, get) => ({
  serverStatus: null,
  status: null,
  optimisticItems: {},
  loaded: false,
  revision: 0,
  subscriberCount: 0,
  unsubscribe: null,
  addSubscriber: () => {
    if (get().subscriberCount === 0) {
      const unsubscribe = subscribeStorageEvent(
        'eagle.organize',
        scheduleThrottledRefresh,
      )
      set({ unsubscribe })
      void doFetchStatus()
    }
    set((state) => ({ subscriberCount: state.subscriberCount + 1 }))
  },
  removeSubscriber: () => {
    const subscriberCount = Math.max(0, get().subscriberCount - 1)
    if (subscriberCount === 0) {
      get().unsubscribe?.()
      clearScheduledRefresh()
      set({ unsubscribe: null })
    }
    set({ subscriberCount })
  },
}))

export function useOrganizeStatus() {
  const status = useOrganizeStore((s) => s.status)
  const serverStatus = useOrganizeStore((s) => s.serverStatus)
  const loaded = useOrganizeStore((s) => s.loaded)
  const revision = useOrganizeStore((s) => s.revision)
  const addSubscriber = useOrganizeStore((s) => s.addSubscriber)
  const removeSubscriber = useOrganizeStore((s) => s.removeSubscriber)
  useEffect(() => {
    addSubscriber()
    return removeSubscriber
  }, [addSubscriber, removeSubscriber])
  return { status, serverStatus, loaded, revision }
}

/** 同一 ID 同时只能有一个本地操作；卸载后的提交仍持有记录直到校准完成。 */
export const beginOptimisticItem = (
  itemId: string,
  taskCreatedAt: number,
): boolean => {
  const state = useOrganizeStore.getState()
  if (
    taskCreatedAt !== state.serverStatus?.createdAt ||
    state.optimisticItems[itemId]
  )
    return false
  const optimisticItems = {
    ...state.optimisticItems,
    [itemId]: { taskCreatedAt, state: 'queued' as const },
  }
  useOrganizeStore.setState({
    optimisticItems,
    status: deriveStatus(state.serverStatus, optimisticItems),
  })
  return true
}

export const getOptimisticItemIds = () =>
  new Set(Object.keys(useOrganizeStore.getState().optimisticItems))

export const isCurrentOrganizeTask = (createdAt: number) =>
  useOrganizeStore.getState().serverStatus?.createdAt === createdAt

export const markOptimisticItemsSubmitting = (
  ids: string[],
  taskCreatedAt: number,
) => {
  statusEpoch++
  useOrganizeStore.setState((state) => {
    const optimisticItems = { ...state.optimisticItems }
    for (const id of ids) {
      if (optimisticItems[id]?.taskCreatedAt === taskCreatedAt)
        optimisticItems[id] = { ...optimisticItems[id], state: 'submitting' }
    }
    return { optimisticItems }
  })
}

/** 失败直接删除乐观操作即可回补，无需反向修改服务端计数。 */
export const cancelOptimisticItems = (ids: string[], taskCreatedAt: number) => {
  if (ids.length === 0) return
  statusEpoch++
  useOrganizeStore.setState((state) => {
    const optimisticItems = { ...state.optimisticItems }
    for (const id of ids) {
      if (optimisticItems[id]?.taskCreatedAt === taskCreatedAt)
        delete optimisticItems[id]
    }
    return {
      optimisticItems,
      status: deriveStatus(state.serverStatus, optimisticItems),
    }
  })
}

export const settleOptimisticItems = async (
  ids: string[],
  taskCreatedAt: number,
) => {
  statusEpoch++
  useOrganizeStore.setState((state) => {
    const optimisticItems = { ...state.optimisticItems }
    for (const id of ids) {
      if (optimisticItems[id]?.taskCreatedAt === taskCreatedAt)
        optimisticItems[id] = { ...optimisticItems[id], state: 'settled' }
    }
    return { optimisticItems }
  })
  await refreshOrganizeStatus()
}
