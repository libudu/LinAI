import type { IncomingMessage } from 'node:http'
import type { Plugin, ProxyOptions } from 'vite'
import { AUTH_PROXY_HEADER, signProxyContext } from './network'

/** Vite 自己提供页面和源码资源，也必须在送出内容前检查后端登录状态。 */
export function createDevAuth(
  secret: string,
  target: string,
): { plugin: Plugin; proxy: ProxyOptions } {
  const context = (request: IncomingMessage) =>
    signProxyContext(
      request.socket.remoteAddress || '',
      request.headers.host || '',
      secret,
    )
  return {
    plugin: {
      name: 'linai-development-login',
      configureServer(server) {
        server.middlewares.use(async (request, response, next) => {
          const url = new URL(request.url || '/', 'http://localhost')
          if (
            url.pathname.startsWith('/api') ||
            url.pathname.startsWith('/v1') ||
            url.pathname === '/auth/login'
          ) {
            next()
            return
          }
          try {
            const status = await fetch(`${target}/api/auth/status`, {
              headers: {
                [AUTH_PROXY_HEADER]: context(request),
                Cookie: request.headers.cookie || '',
                'Sec-Fetch-Site': String(
                  request.headers['sec-fetch-site'] || '',
                ),
              },
              signal: AbortSignal.timeout(5000),
            })
            if (!status.ok) throw new Error('读取登录状态失败')
            const json = await status.json()
            if (json.success && json.data.authenticated) {
              next()
              return
            }
            response.setHeader('Cache-Control', 'no-store')
            if (request.headers.accept?.includes('text/html')) {
              response.writeHead(302, {
                Location: `/auth/login?returnTo=${encodeURIComponent(url.pathname + url.search)}`,
              })
              response.end()
            } else {
              response.writeHead(401, {
                'Content-Type': 'application/json; charset=utf-8',
                'X-LinAI-Auth': 'required',
              })
              response.end(
                JSON.stringify({
                  success: false,
                  error: {
                    code: 'AUTH_REQUIRED',
                    message: '请先输入登录验证码',
                  },
                }),
              )
            }
          } catch {
            response.writeHead(503, {
              'Content-Type': 'text/plain; charset=utf-8',
              'Cache-Control': 'no-store',
            })
            response.end('无法连接 LinAI 后端，请确认后端已启动后刷新。')
          }
        })
      },
    },
    proxy: {
      target,
      changeOrigin: true,
      configure(proxy) {
        proxy.on('proxyReq', (upstream, request) => {
          upstream.setHeader(AUTH_PROXY_HEADER, context(request))
        })
      },
    },
  }
}
