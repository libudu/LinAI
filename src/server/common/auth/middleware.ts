import type { Context, Next } from 'hono'
import { isEagleSharingProtocol } from '../../module/eagle/sharing/protocol'
import { changeBus } from '../storage/change-bus'
import { getLoginAccess } from './service'

const PUBLIC_PATHS = new Set([
  '/auth/login',
  '/api/auth/status',
  '/api/auth/login',
])

/** Eagle 的指定共享协议使用邀请码/会话鉴权，其余入口统一校验系统登录。 */
export async function requireLogin(c: Context, next: Next) {
  if (
    PUBLIC_PATHS.has(c.req.path) ||
    // 登录页及共用的前端静态资源不含业务数据，API 仍统一校验登录。
    ((c.req.method === 'GET' || c.req.method === 'HEAD') &&
      c.req.path.startsWith('/assets/')) ||
    isEagleSharingProtocol(c.req.method, c.req.path)
  )
    return next()
  const access = await getLoginAccess(c)
  if (!access.authenticated) {
    c.header('Cache-Control', 'no-store')
    c.header('X-LinAI-Auth', 'required')
    if (
      (c.req.method === 'GET' || c.req.method === 'HEAD') &&
      !c.req.path.startsWith('/api/') &&
      !c.req.path.startsWith('/v1') &&
      c.req.header('accept')?.includes('text/html')
    ) {
      const url = new URL(c.req.url)
      return c.redirect(
        `/auth/login?returnTo=${encodeURIComponent(url.pathname + url.search)}`,
        302,
      )
    }
    return c.json(
      {
        success: false as const,
        error: {
          code: 'AUTH_REQUIRED',
          message: access.configured
            ? '请先输入登录验证码'
            : '请先在 localhost 的系统设置中配置登录验证码',
        },
      },
      401,
    )
  }
  await next()
  if (access.local || !c.res.body) return
  c.header('Cache-Control', 'private, no-store')
  // 已建立的 SSE / 媒体流也不能在验证码变更或 Cookie 到期后继续传输。
  const response = c.res
  const reader = response.body!.getReader()
  let ended = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let unsubscribe = () => {}
  let abort = () => {}
  const cleanup = () => {
    if (timer) clearTimeout(timer)
    unsubscribe()
    c.req.raw.signal.removeEventListener('abort', abort)
  }
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      abort = () => {
        if (ended) return
        ended = true
        cleanup()
        void reader.cancel().catch(() => undefined)
        controller.error(new Error('登录状态已失效'))
      }
      const expire = () => {
        const remaining = (access.expiresAt ?? 0) - Date.now()
        if (remaining <= 0) abort()
        else timer = setTimeout(expire, Math.min(remaining, 2147483647))
      }
      unsubscribe = changeBus.subscribe('settings.system', () => {
        void getLoginAccess(c)
          .then((current) => {
            if (!current.authenticated) abort()
          })
          .catch(abort)
      })
      c.req.raw.signal.addEventListener('abort', abort, { once: true })
      if (c.req.raw.signal.aborted) abort()
      else expire()
    },
    async pull(controller) {
      try {
        const result = await reader.read()
        if (ended) return
        if (result.done) {
          ended = true
          cleanup()
          controller.close()
        } else controller.enqueue(result.value)
      } catch (error) {
        if (ended) return
        ended = true
        cleanup()
        controller.error(error)
      }
    },
    cancel() {
      ended = true
      cleanup()
      return reader.cancel()
    },
  })
  c.res = new Response(body, {
    status: response.status,
    headers: response.headers,
  })
}
