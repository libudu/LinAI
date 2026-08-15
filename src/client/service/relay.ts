import { apiRequest } from './storage'

/**
 * 受限请求中继客户端（POST /api/relay/:target）。
 * 目标、方法与路径白名单由服务端注册定义控制，凭据由服务端注入。
 * 仅用于非流式调用；流式（SSE）调用见各模块的 fetch 封装（如 Novel/service/llm.ts）
 */
export const relayRequest = <T>(
  target: string,
  req: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
    path: string
    body?: unknown
  },
): Promise<T> =>
  apiRequest<T>(`/api/relay/${target}`, {
    method: 'POST',
    body: JSON.stringify(req),
  }).then((r) => r.data)
