import { createResourceCache } from '@/client/service/resource-cache'
import { apiRequest } from '@/client/service/storage'
import type { Task } from '@/server/common/task'

const cache = createResourceCache({
  resource: 'image.tasks',
  initialValue: [] as Task[],
  load: async () => {
    const { data } = await apiRequest<Task[]>('/api/task')
    return [...data].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  },
})

export const refreshTasks = cache.invalidate
export const useTasks = cache.useCache
