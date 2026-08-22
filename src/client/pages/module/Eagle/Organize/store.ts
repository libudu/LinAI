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

let refreshSequence = 0

const refreshStatus = async (): Promise<void> => {
  const sequence = ++refreshSequence
  try {
    const status = await fetchOrganizeStatus()
    // SSE 事件可能密集触发并发请求，只允许最后发起的请求更新状态，
    // 避免较旧响应晚到后把 confirming 覆盖回 running/paused。
    if (sequence !== refreshSequence) return
    useOrganizeStore.setState({ status, loaded: true })
  } catch (error) {
    console.error('拉取图片整理任务状态失败', error)
    if (sequence !== refreshSequence) return
    useOrganizeStore.setState({ loaded: true })
  }
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
        refreshStatus()
        const es = new EventSource(
          '/api/storage/events?resources=eagle.organize',
        )
        es.addEventListener('change', () => {
          refreshStatus()
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
