import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { getLoginStatus, login } from '../../common/auth/service'

const authApi = new Hono()
  .use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store')
    await next()
  })
  .get('/status', async (c) =>
    c.json({ success: true as const, data: await getLoginStatus(c) }),
  )
  .post('/login', bodyLimit({ maxSize: 1024 }), async (c) => {
    let code = ''
    try {
      const body: unknown = await c.req.json()
      if (
        body &&
        typeof body === 'object' &&
        'code' in body &&
        typeof body.code === 'string' &&
        body.code.length <= 64
      )
        code = body.code
    } catch {
      /* 非法输入同样计入失败次数。 */
    }
    const result = await login(c, code)
    if (!result.ok) {
      if (result.retryAfter) c.header('Retry-After', String(result.retryAfter))
      return c.json(
        {
          success: false as const,
          error: {
            code: result.retryAfter ? 'LOGIN_LOCKED' : 'INVALID_LOGIN_CODE',
            message: result.error,
          },
          remainingAttempts: result.remainingAttempts,
          retryAfter: result.retryAfter,
        },
        result.status,
      )
    }
    return c.json({
      success: true as const,
      data: { expiresAt: result.expiresAt },
    })
  })

export default authApi
