import type { IncomingMessage } from 'node:http'
import { posix } from 'node:path'
import type { Plugin, ProxyOptions } from 'vite'
import { AUTH_PROXY_HEADER, signProxyContext } from './network'

/** Vite 提供登录页及前端依赖，其余页面在送出内容前检查后端登录状态。 */
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
          let pathname: string
          try {
            pathname = posix.normalize(
              decodeURIComponent(url.pathname).replace(/\\/g, '/'),
            )
          } catch {
            response.writeHead(400)
            response.end('请求路径无效')
            return
          }
          // 登录页独立使用 React / antd，仅公开前端源码及其 Vite 依赖。
          if (pathname === '/auth/login') {
            request.url = `/login.html${url.search}`
            response.setHeader('Cache-Control', 'no-store')
            next()
            return
          }
          const frontendAsset =
            pathname === '/login.html' ||
            pathname === '/@react-refresh' ||
            [
              '/src/client/',
              '/src/shared/',
              '/node_modules/',
              '/@vite/',
              '/@id/',
            ].some((prefix) => pathname.startsWith(prefix)) ||
            /^\/@fs\/.*\/node_modules\//.test(pathname)
          if (
            url.pathname.startsWith('/api') ||
            url.pathname.startsWith('/v1') ||
            ((request.method === 'GET' || request.method === 'HEAD') &&
              frontendAsset)
          ) {
            if (pathname === '/login.html')
              response.setHeader('Cache-Control', 'no-store')
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
