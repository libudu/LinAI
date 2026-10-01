import { rpcData } from '@/client/service/http'
import { createResourceCache } from '@/client/service/resource-cache'
import type { AppType } from '@/server'
import { hc, type InferRequestType, type InferResponseType } from 'hono/client'

const client = hc<AppType>('/')
type TaskPage = InferResponseType<typeof client.api.task.page.$get>['data']
export type ImageTaskSummary = InferResponseType<
  typeof client.api.task.summary.$get
>['data']
export const PAGE_SIZE = 10
const pages = new Map<number, ReturnType<typeof createPageCache>>()
function createPageCache(page: number) {
  return createResourceCache({
    resource: 'image.tasks',
    initialValue: {
      items: [],
      total: 0,
      page,
      pageSize: PAGE_SIZE,
    } as TaskPage,
    load: () =>
      rpcData(
        client.api.task.page.$get({
          query: { page: String(page), pageSize: String(PAGE_SIZE) },
        }),
      ),
  })
}
const summaryCache = createResourceCache({
  resource: 'image.tasks',
  initialValue: {
    total: 0,
    active: 0,
    finishedAt: 0,
    cloudCompletedAt: 0,
  } as ImageTaskSummary,
  load: () => rpcData(client.api.task.summary.$get()),
})
export const refreshTasks = () => {
  summaryCache.invalidate()
  pages.forEach((cache) => cache.invalidate())
}
export const useTaskSummary = summaryCache.useCache
export function useTasks(page: number) {
  let cache = pages.get(page)
  if (!cache) {
    cache = createPageCache(page)
    pages.set(page, cache)
  }
  // TaskList 只挂载一个页面；保留少量最近页供切换，避免缓存随历史无限增长。
  if (pages.size > 5) {
    const oldest = pages.keys().next().value
    if (oldest !== undefined && oldest !== page) pages.delete(oldest)
  }
  return cache.useCache()
}
export const loadTaskOutputs = () => rpcData(client.api.task.outputs.$get())
export const loadTaskIds = (
  status?: InferRequestType<typeof client.api.task.ids.$get>['query']['status'],
) => rpcData(client.api.task.ids.$get({ query: { status } }))
