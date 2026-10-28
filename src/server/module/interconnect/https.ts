import { Agent, request } from 'node:https'
import { Readable } from 'node:stream'

/** 连接池与房间同生命周期，固定目标和证书，不跨房间复用 TLS 会话。 */
export function createRoomTransport(url: string, certificate: string) {
  const target = new URL(url)
  if (
    target.protocol !== 'https:' ||
    target.hostname !== '127.0.0.1' ||
    target.username ||
    target.password
  )
    throw new Error('房间资源只能经固定的本地 TLS 转发访问')
  const agentOptions = {
    ca: certificate,
    rejectUnauthorized: true,
    keepAlive: true,
    // 为短请求保留复用机会，同时及时清理长时间空闲的连接。
    timeout: 30000,
  }
  // 媒体传输不能占满心跳、成员登记和目录查询使用的连接。
  const controlAgent = new Agent({
    ...agentOptions,
    maxSockets: 4,
    maxFreeSockets: 4,
  })
  const mediaAgent = new Agent({
    ...agentOptions,
    maxSockets: 16,
    maxFreeSockets: 8,
  })
  let closed = false
  return {
    url: target.origin,
    fetch(path: string | URL, init: RequestInit = {}): Promise<Response> {
      const resource = new URL(path, target)
      if (
        closed ||
        resource.origin !== target.origin ||
        resource.username ||
        resource.password
      )
        return Promise.reject(new Error('房间传输已关闭或请求目标不匹配'))
      const media =
        /^\/api\/eagle\/sharing\/library\/items\/[A-Za-z0-9]+\/(?:thumbnail|preview|file)$/.test(
          resource.pathname,
        )
      return fetchRoomResource(
        resource,
        media ? mediaAgent : controlAgent,
        init,
      )
    },
    close() {
      closed = true
      controlAgent.destroy()
      mediaAgent.destroy()
    },
  }
}

export type RoomTransport = ReturnType<typeof createRoomTransport>

/** 会话凭据只在固定信任房主证书的 TLS 通道发送。 */
function fetchRoomResource(target: URL, agent: Agent, init: RequestInit) {
  return new Promise<Response>((resolve, reject) => {
    const headers = Object.fromEntries(new Headers(init.headers).entries())
    const req = request(
      target,
      {
        method: init.method ?? 'GET',
        headers,
        agent,
        rejectUnauthorized: true,
        signal: init.signal ?? undefined,
      },
      (response) => {
        const responseHeaders = new Headers()
        for (const [key, value] of Object.entries(response.headers)) {
          if (Array.isArray(value))
            value.forEach((item) => responseHeaders.append(key, item))
          else if (value !== undefined) responseHeaders.set(key, value)
        }
        const status = response.statusCode ?? 502
        if (status >= 300 && status < 400 && status !== 304) {
          response.destroy()
          reject(new Error('房间共享接口不允许重定向'))
          return
        }
        resolve(
          new Response(
            [204, 205, 304].includes(status)
              ? null
              : (Readable.toWeb(response) as ReadableStream<Uint8Array>),
            {
              status,
              headers: responseHeaders,
            },
          ),
        )
      },
    )
    req.on('error', reject)
    if (init.body && typeof init.body !== 'string') {
      req.destroy()
      reject(new Error('不支持的共享请求体'))
      return
    }
    req.end(init.body ?? undefined)
  })
}
