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
  eventSource: EventSource | null
  addSubscriber: () => void
  removeSubscriber: () => void
  refresh: () => Promise<void>
}

let isFetching = false
let hasPendingRefresh = false
let debounceTimer: ReturnType<typeof setTimeout> | null = null

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
  if (isFetching) {
    hasPendingRefresh = true
    return
  }
  isFetching = true
  try {
    const status = await fetchOrganizeStatus()
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
    if (hasPendingRefresh) {
      hasPendingRefresh = false
      queueMicrotask(() => {
        void doFetchStatus()
      })
    }
  }
}

/** 触发带防抖的状态刷新（供高频 SSE 变更使用） */
const triggerDebouncedRefresh = (delay = 200) => {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    void doFetchStatus()
  }, delay)
}

/** 立即刷新（取消防抖定时器并直接发起请求） */
const refreshStatus = async (): Promise<void> => {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  await doFetchStatus()
}

const useOrganizeStore = create<OrganizeState>((set) => ({
  status: null,
  loaded: false,
  subscriberCount: 0,
  eventSource: null,

  addSubscriber: () => {
    set((state) => {
      const newCount = state.subscriberCount + 1
      if (newCount === 1 && !state.eventSource) {
        void doFetchStatus()
        const es = new EventSource(
          '/api/storage/events?resources=eagle.organize',
        )
        es.addEventListener('change', () => {
          triggerDebouncedRefresh(200)
        })
        es.onerror = (error) => {
          console.error('图片整理任务 SSE 连接错误', error)
        }
        return { subscriberCount: newCount, eventSource: es }
      }
      return { subscriberCount: newCount }
    })
  },

  removeSubscriber: () => {
    set((state) => {
      const newCount = Math.max(0, state.subscriberCount - 1)
      if (newCount === 0 && state.eventSource) {
        if (debounceTimer) {
          clearTimeout(debounceTimer)
          debounceTimer = null
        }
        state.eventSource.close()
        return { subscriberCount: newCount, eventSource: null }
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
