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

/** 保留 RPC 成功分支，顶层字段与标准 data 信封共用错误解析。 */
export const rpcResult = async <
  R extends ClientResponse<{ success: boolean }, number, 'json'>,
>(
  response: Promise<R>,
): Promise<Extract<Awaited<ReturnType<R['json']>>, { success: true }>> => {
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
  return json as Extract<Awaited<ReturnType<R['json']>>, { success: true }>
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

/** 标准信封仅取 data，错误解析与 rpcResult 共用。 */
export const rpcData = async <
  R extends ClientResponse<{ success: boolean }, number, 'json'>,
>(
  response: Promise<R>,
): Promise<RpcData<R>> => {
  const json = await rpcResult(response)
  return (json as unknown as { data: RpcData<R> }).data
}
