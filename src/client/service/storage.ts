import type {
  CollectionBatchOperation,
  StoredEntity,
  StoredEntitySummary,
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

/** 存储接口错误：message 为服务端中文信息，code 为结构化错误码（如 REVISION_CONFLICT） */
export class StorageApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'StorageApiError'
  }
}

export const apiRequest = async <T>(
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
    const code = typeof error === 'string' ? undefined : error?.code
    throw new StorageApiError(message, code)
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
      const json = await apiRequest<{ items: StoredItem<T>[] }>(base)
      return { revision: json.revision ?? 0, items: json.data.items }
    },
    create: (value: T): Promise<StoredItem<T>> =>
      apiRequest<StoredItem<T>>(base, {
        method: 'POST',
        body: JSON.stringify({ value }),
      }).then((r) => r.data),
    replace: (
      id: string,
      value: T,
      expectedRevision?: number,
    ): Promise<StoredItem<T>> =>
      apiRequest<StoredItem<T>>(`${base}/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ value, expectedRevision }),
      }).then((r) => r.data),
    remove: (id: string): Promise<void> =>
      apiRequest<void>(`${base}/${id}`, { method: 'DELETE' }).then(
        () => undefined,
      ),
    batch: (
      operations: CollectionBatchOperation<T>[],
      expectedRevision?: number,
    ): Promise<void> =>
      apiRequest<void>(`${base}/batch`, {
        method: 'POST',
        body: JSON.stringify({ operations, expectedRevision }),
      }).then(() => undefined),
  }
}

/**
 * 通用实体存储客户端（/api/storage/entities/:resource）。
 * 列表只返回摘要；value 与 summary 均由前端定义并随写入一并提交
 */
export const entityClient = <T, S>(resource: string) => {
  const base = `/api/storage/entities/${resource}`
  return {
    list: (): Promise<StoredEntitySummary<S>[]> =>
      apiRequest<{ items: StoredEntitySummary<S>[] }>(base).then(
        (r) => r.data.items,
      ),
    create: (value: T, summary: S, id?: string): Promise<StoredEntity<T, S>> =>
      apiRequest<StoredEntity<T, S>>(base, {
        method: 'POST',
        body: JSON.stringify({ value, summary, id }),
      }).then((r) => r.data),
    get: (id: string): Promise<StoredEntity<T, S>> =>
      apiRequest<StoredEntity<T, S>>(`${base}/${id}`).then((r) => r.data),
    replace: (
      id: string,
      value: T,
      summary: S,
      expectedRevision?: number,
    ): Promise<StoredEntity<T, S>> =>
      apiRequest<StoredEntity<T, S>>(`${base}/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ value, summary, expectedRevision }),
      }).then((r) => r.data),
    remove: (id: string): Promise<void> =>
      apiRequest<void>(`${base}/${id}`, { method: 'DELETE' }).then(
        () => undefined,
      ),
  }
}
