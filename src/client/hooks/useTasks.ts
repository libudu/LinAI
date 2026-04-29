import { useEffect } from 'react'
import { create } from 'zustand'
import type { Task } from '../../server/common/task-manager'

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
          const es = new EventSource('/api/task/stream')

          es.onmessage = (event) => {
            try {
              const json = JSON.parse(event.data)
              if (json.success) {
                const tasks = json.data as Task[]
                tasks.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
                set({ data: tasks, loading: false })
              } else {
                set({ data: [], loading: false })
              }
            } catch (error) {
              console.error('Failed to parse tasks SSE data', error)
            }
          }

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
