import type {
  CollectionBatchOperation,
  StoredItem,
} from '@/shared/storage/types'

/**
 * 通用集合存储客户端（/api/storage/collections/:resource）。
 * 资源为动态路径，不走 hc 类型推导；统一在此处理错误结构。
 */

interface ApiErrorBody {
  success: false
  error?: { code?: string; message?: string } | string
}

const request = async <T>(
  url: string,
  init?: RequestInit,
): Promise<{ data: T; revision?: number }> => {
  const res = await fetch(url, {
    headers: { 'content-type': 'application/json' },
    ...init,
  })
  const json = await res.json()
  if (!res.ok || !json.success) {
    const error = (json as ApiErrorBody).error
    const message =
      typeof error === 'string'
        ? error
        : error?.message || `请求失败（${res.status}）`
    throw new Error(message)
  }
  return json
}

export interface CollectionListResult<T> {
  /** 集合级版本号，批量/更新时可作为 expectedRevision 做冲突检测 */
  revision: number
  items: StoredItem<T>[]
}

export const collectionClient = <T>(resource: string) => {
  const base = `/api/storage/collections/${resource}`
  return {
    list: async (): Promise<CollectionListResult<T>> => {
      const json = await request<{ items: StoredItem<T>[] }>(base)
      return { revision: json.revision ?? 0, items: json.data.items }
    },
    create: (value: T): Promise<StoredItem<T>> =>
      request<StoredItem<T>>(base, {
        method: 'POST',
        body: JSON.stringify({ value }),
      }).then((r) => r.data),
    replace: (
      id: string,
      value: T,
      expectedRevision?: number,
    ): Promise<StoredItem<T>> =>
      request<StoredItem<T>>(`${base}/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ value, expectedRevision }),
      }).then((r) => r.data),
    remove: (id: string): Promise<void> =>
      request<void>(`${base}/${id}`, { method: 'DELETE' }).then(
        () => undefined,
      ),
    batch: (
      operations: CollectionBatchOperation<T>[],
      expectedRevision?: number,
    ): Promise<void> =>
      request<void>(`${base}/batch`, {
        method: 'POST',
        body: JSON.stringify({ operations, expectedRevision }),
      }).then(() => undefined),
  }
}
