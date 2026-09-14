import { subscribeStorageEvent } from '@/client/service/storage-events'
import type { OrganizeStatus } from '@/shared/eagle/organize'
import { useEffect } from 'react'
import { create } from 'zustand'
import { fetchOrganizeStatus } from './api'

// 图片整理任务状态：徽标（Toolbar）与整理弹窗共用，
// 订阅 SSE 变更事件（eagle.organize）后重新拉取轻量 status

interface OrganizeState {
  status: OrganizeStatus | null
  loaded: boolean
  subscriberCount: number
  unsubscribe: (() => void) | null
  addSubscriber: () => void
  removeSubscriber: () => void
  refresh: () => Promise<void>
}

const MIN_REFRESH_INTERVAL_MS = 3000

let isFetching = false
let hasPendingRefresh = false
let hasImmediateRefresh = false
let isSuspended = false
let scheduledTimer: ReturnType<typeof setTimeout> | null = null
let lastFetchedAt = 0

const isEqualStatus = (
  a: OrganizeStatus | null,
  b: OrganizeStatus | null,
): boolean => {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.phase === b.phase &&
    a.remaining === b.remaining &&
    a.pendingConfirm === b.pendingConfirm &&
    a.failedCount === b.failedCount &&
    a.pausedReason === b.pausedReason &&
    a.folderId === b.folderId &&
    a.folderName === b.folderName &&
    a.isLocked === b.isLocked
  )
}

const doFetchStatus = async (): Promise<void> => {
  if (isFetching || isSuspended) {
    if (isSuspended) {
      hasPendingRefresh = true
    }
    return
  }
  if (scheduledTimer) {
    clearTimeout(scheduledTimer)
    scheduledTimer = null
  }
  isFetching = true
  try {
    const status = await fetchOrganizeStatus()
    lastFetchedAt = Date.now()
    const current = useOrganizeStore.getState().status
    if (!isEqualStatus(current, status)) {
      useOrganizeStore.setState({ status, loaded: true })
    } else if (!useOrganizeStore.getState().loaded) {
      useOrganizeStore.setState({ loaded: true })
    }
  } catch (error) {
    console.error('拉取图片整理任务状态失败', error)
    if (!useOrganizeStore.getState().loaded) {
      useOrganizeStore.setState({ loaded: true })
    }
  } finally {
    isFetching = false
    if (hasImmediateRefresh) {
      hasImmediateRefresh = false
      hasPendingRefresh = false
      void doFetchStatus()
    } else if (hasPendingRefresh) {
      hasPendingRefresh = false
      scheduleThrottledRefresh()
    }
  }
}

/** 按照最快 3 秒一次的频率调度状态刷新（供高频 SSE 变更使用；挂起状态下仅记录脏位） */
const scheduleThrottledRefresh = () => {
  if (isSuspended) {
    hasPendingRefresh = true
    return
  }
  if (scheduledTimer) return

  const elapsed = Date.now() - lastFetchedAt
  const remaining = Math.max(0, MIN_REFRESH_INTERVAL_MS - elapsed)

  if (remaining === 0 && !isFetching) {
    void doFetchStatus()
  } else {
    hasPendingRefresh = true
    scheduledTimer = setTimeout(() => {
      scheduledTimer = null
      hasPendingRefresh = false
      void doFetchStatus()
    }, remaining)
  }
}

/** 立即刷新（取消防抖/节流定时器并直接发起请求，供主动操作后使用） */
const refreshStatus = async (): Promise<void> => {
  if (scheduledTimer) {
    clearTimeout(scheduledTimer)
    scheduledTimer = null
  }
  if (isFetching) {
    hasImmediateRefresh = true
    return
  }
  hasImmediateRefresh = false
  hasPendingRefresh = false
  await doFetchStatus()
}

const useOrganizeStore = create<OrganizeState>((set) => ({
  status: null,
  loaded: false,
  subscriberCount: 0,
  unsubscribe: null,

  addSubscriber: () => {
    set((state) => {
      const newCount = state.subscriberCount + 1
      if (newCount === 1 && !state.unsubscribe) {
        void doFetchStatus()
        const unsub = subscribeStorageEvent('eagle.organize', () => {
          scheduleThrottledRefresh()
        })
        return { subscriberCount: newCount, unsubscribe: unsub }
      }
      return { subscriberCount: newCount }
    })
  },

  removeSubscriber: () => {
    set((state) => {
      const newCount = Math.max(0, state.subscriberCount - 1)
      if (newCount === 0 && state.unsubscribe) {
        if (scheduledTimer) {
          clearTimeout(scheduledTimer)
          scheduledTimer = null
        }
        state.unsubscribe()
        return { subscriberCount: newCount, unsubscribe: null }
      }
      return { subscriberCount: newCount }
    })
  },

  refresh: refreshStatus,
}))

export function useOrganizeStatus() {
  const status = useOrganizeStore((s) => s.status)
  const loaded = useOrganizeStore((s) => s.loaded)
  const addSubscriber = useOrganizeStore((s) => s.addSubscriber)
  const removeSubscriber = useOrganizeStore((s) => s.removeSubscriber)

  useEffect(() => {
    addSubscriber()
    return () => {
      removeSubscriber()
    }
  }, [addSubscriber, removeSubscriber])

  return { status, loaded }
}

/** 操作后主动刷新（SSE 之外兜底） */
export const refreshOrganizeStatus = () => useOrganizeStore.getState().refresh()

/**
 * 挂起/恢复状态刷新轮询：
 * 结果确认界面挂载期间调用挂起，彻底截断无意义的高频 status 网络请求；
 * 退出确认流时恢复挂起，若期间有积攒的脏标记则自动校准一次最新状态。
 */
export const setOrganizeStatusSuspended = (suspended: boolean) => {
  if (isSuspended === suspended) return
  isSuspended = suspended
  if (!suspended && hasPendingRefresh) {
    hasPendingRefresh = false
    void doFetchStatus()
  }
}

/**
 * 本地乐观扣减待确认数量：
 * 确认/跳过/清除分类等操作发生时即时更新外层徽标，无需发网络请求
 */
export const decrementPendingConfirm = (count = 1) => {
  if (count <= 0) return
  useOrganizeStore.setState((state) => {
    if (!state.status) return state
    const nextPending = Math.max(0, state.status.pendingConfirm - count)
    const isNowDone = state.status.phase === 'confirming' && nextPending === 0
    return {
      status: {
        ...state.status,
        pendingConfirm: nextPending,
        phase: isNowDone ? 'done' : state.status.phase,
        isLocked: isNowDone ? false : state.status.isLocked,
      },
    }
  })
}
