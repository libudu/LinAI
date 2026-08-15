import type { Task } from '@/server/common/task'
import { useEffect } from 'react'
import { create } from 'zustand'

const fetchTasks = async (): Promise<Task[]> => {
  const res = await fetch('/api/task')
  const json = await res.json()
  if (!json.success) {
    throw new Error(json.error || 'Failed to load tasks')
  }
  const tasks = json.data as Task[]
  tasks.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  return tasks
}

interface TasksState {
  data: Task[]
  loading: boolean
  subscriberCount: number
  eventSource: EventSource | null
  addSubscriber: () => void
  removeSubscriber: () => void
}

const useTasksStore = create<TasksState>((set, get) => ({
  data: [],
  loading: true,
  subscriberCount: 0,
  eventSource: null,
  addSubscriber: () => {
    set((state) => {
      const newCount = state.subscriberCount + 1
      if (newCount === 1) {
        if (!state.eventSource) {
          // 初始拉取 + 订阅统一变更事件：SSE 只携带资源版本信息，收到 change 后重新拉取
          fetchTasks()
            .then((tasks) => set({ data: tasks, loading: false }))
            .catch((error) => {
              console.error('Failed to load tasks', error)
              set({ loading: false })
            })

          const es = new EventSource(
            '/api/storage/events?resources=image.tasks',
          )

          es.addEventListener('change', () => {
            fetchTasks()
              .then((tasks) => set({ data: tasks }))
              .catch((error) => console.error('Failed to refresh tasks', error))
          })

          es.onerror = (error) => {
            console.error('SSE Error:', error)
          }

          return {
            subscriberCount: newCount,
            eventSource: es,
            loading: get().data.length === 0,
          }
        }
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
}))

export function useTasks() {
  const data = useTasksStore((state) => state.data)
  const loading = useTasksStore((state) => state.loading)
  const addSubscriber = useTasksStore((state) => state.addSubscriber)
  const removeSubscriber = useTasksStore((state) => state.removeSubscriber)

  useEffect(() => {
    addSubscriber()
    return () => {
      removeSubscriber()
    }
  }, [addSubscriber, removeSubscriber])

  return {
    data,
    loading,
  }
}
