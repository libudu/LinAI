import type { ClientResponse } from 'hono/client'

interface ApiErrorBody {
  success: false
  error?: { code?: string; message?: string } | string
}

/** 接口错误保留业务码与 HTTP 状态，供调用方区分缺失、冲突和写入失败。 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const requestError = (body: unknown, status: number) => {
  const error = (body as ApiErrorBody | null)?.error
  return new ApiError(
    typeof error === 'string'
      ? error
      : error?.message || `请求失败（${status}）`,
    typeof error === 'string' ? undefined : error?.code,
    status,
  )
}

type SuccessData<T> = T extends { success: true; data: infer D } ? D : never
type RpcData<R extends ClientResponse<{ success: boolean }, number, 'json'>> =
  SuccessData<Awaited<ReturnType<R['json']>>>

/** 保留整个 RPC 响应联合类型，再提取成功分支的数据。 */
export const rpcData = async <
  R extends ClientResponse<{ success: boolean }, number, 'json'>,
>(
  response: Promise<R>,
): Promise<RpcData<R>> => {
  const res = await response
  let json: { success: boolean }
  try {
    json = await res.json()
  } catch {
    throw new ApiError(
      `响应不是有效 JSON（${res.status}）`,
      undefined,
      res.status,
    )
  }
  if (!res.ok || !json.success) throw requestError(json, res.status)
  // 错误分支已排除；仅在通用解包边界取出路由推导的数据。
  return (json as { success: boolean; data: RpcData<R> }).data
}

/** 动态存储/设置资源的请求封装，响应契约由资源客户端指定。 */
export const apiRequest = async <T>(
  url: string,
  init?: RequestInit,
): Promise<{ data: T; revision?: number }> => {
  const headers = new Headers(init?.headers)
  if (!headers.has('content-type'))
    headers.set('content-type', 'application/json')
  const res = await fetch(url, { ...init, headers })
  const json = await res.json()
  if (!res.ok || !json.success) throw requestError(json, res.status)
  return json
}
