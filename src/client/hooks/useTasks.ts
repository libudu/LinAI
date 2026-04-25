import { create } from 'zustand'
import { useEffect } from 'react'
import { hc } from 'hono/client'
import type { AppType } from '../../server'
import type { Task } from '../../server/common/task-manager'

const client = hc<AppType>('/')

interface TasksState {
  data: Task[]
  loading: boolean
  subscriberCount: number
  fetchPromise: Promise<void> | null
  fetchTasks: (force?: boolean) => Promise<void>
  addSubscriber: () => void
  removeSubscriber: () => void
}

let pollingTimer: NodeJS.Timeout | null = null

const useTasksStore = create<TasksState>((set, get) => ({
  data: [],
  loading: false,
  subscriberCount: 0,
  fetchPromise: null,
  fetchTasks: async (force = false) => {
    const state = get()
    // 防抖：如果有正在进行的请求且不是强制刷新，则返回当前 Promise
    if (state.fetchPromise && !force) {
      return state.fetchPromise
    }

    let currentPromise: Promise<void>
    const doFetch = async () => {
      if (get().data.length === 0) {
        set({ loading: true })
      }
      try {
        const res = await client.api.task.$get()
        const json = await res.json()
        if (json.success) {
          const tasks = json.data as Task[]
          tasks.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
          set({ data: tasks, loading: false })
        } else {
          set({ data: [], loading: false })
        }
      } catch (error) {
        console.error('Failed to fetch tasks', error)
        set({ loading: false })
      } finally {
        // 只有当当前的 fetchPromise 还是自己时，才清空它
        if (get().fetchPromise === currentPromise) {
          set({ fetchPromise: null })
        }
      }
    }

    currentPromise = doFetch()
    set({ fetchPromise: currentPromise })
    return currentPromise
  },
  addSubscriber: () => {
    set((state) => {
      const newCount = state.subscriberCount + 1
      if (newCount === 1) {
        if (!pollingTimer) {
          pollingTimer = setInterval(() => {
            get().fetchTasks(true)
          }, 8000)
        }
      }
      return { subscriberCount: newCount }
    })
  },
  removeSubscriber: () => {
    set((state) => {
      const newCount = Math.max(0, state.subscriberCount - 1)
      if (newCount === 0 && pollingTimer) {
        clearInterval(pollingTimer)
        pollingTimer = null
      }
      return { subscriberCount: newCount }
    })
  }
}))

export function useTasks() {
  const data = useTasksStore((state) => state.data)
  const loading = useTasksStore((state) => state.loading)
  const fetchTasks = useTasksStore((state) => state.fetchTasks)
  const addSubscriber = useTasksStore((state) => state.addSubscriber)
  const removeSubscriber = useTasksStore((state) => state.removeSubscriber)

  useEffect(() => {
    addSubscriber()
    fetchTasks()
    return () => {
      removeSubscriber()
    }
  }, [addSubscriber, fetchTasks, removeSubscriber])

  return {
    data,
    loading,
    refresh: () => fetchTasks(true)
  }
}
