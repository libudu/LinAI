import { request } from 'node:https'
import { Readable } from 'node:stream'

/** 邀请携带房主证书并固定信任，不信任虚拟 IP 或主机名；会话凭据只在已验证的 TLS 通道发送。 */
export function fetchRoomResource(
  url: string | URL,
  certificate: string,
  init: RequestInit = {},
) {
  const target = new URL(url)
  if (target.protocol !== 'https:' || target.hostname !== '127.0.0.1')
    throw new Error('房间资源只能经固定的本地 TLS 转发访问')
  return new Promise<Response>((resolve, reject) => {
    const headers = Object.fromEntries(new Headers(init.headers).entries())
    const req = request(
      target,
      {
        method: init.method ?? 'GET',
        headers,
        ca: certificate,
        agent: false,
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
