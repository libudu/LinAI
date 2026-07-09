import { Hono } from 'hono'

const yunwuTokenApi = new Hono()

function checkAuth(c: any) {
  const systemToken = c.req.header('x-system-token')
  const userId = c.req.header('x-user-id')
  if (!systemToken || !userId) {
    return c.json(
      { success: false as const, error: 'System token and User ID are required' },
      400,
    )
  }
  return { systemToken, userId }
}

async function proxy(c: any, url: string, options?: RequestInit) {
  const auth = checkAuth(c)
  if (auth.status) return auth

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: auth.systemToken,
        'new-api-user': auth.userId,
        ...((options?.headers as Record<string, string>) || {}),
      },
    })
    const data = await response.json()
    if (!response.ok) {
      return c.json(
        { success: false as const, message: data.message || '请求失败' },
        response.status as any,
      )
    }
    return c.json({ success: true as const, data: data.data || data })
  } catch (error: any) {
    return c.json(
      { success: false as const, message: error.message || '请求失败' },
      500,
    )
  }
}

yunwuTokenApi.get('/search-api-keys', async (c) => {
  const keyword = c.req.query('keyword')
  const token = c.req.query('token')
  const url = new URL('https://yunwu.ai/api/token/search')
  if (keyword) url.searchParams.append('keyword', keyword)
  if (token) url.searchParams.append('token', token)
  return proxy(c, url.toString())
})

yunwuTokenApi.get('/token-info/:id', async (c) => {
  const id = c.req.param('id')
  return proxy(c, `https://yunwu.ai/api/token/${id}`)
})

yunwuTokenApi.put('/token-update', async (c) => {
  const body = await c.req.json()
  return proxy(c, 'https://yunwu.ai/api/token/', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
})

yunwuTokenApi.get('/user-groups', async (c) => {
  return proxy(c, 'https://yunwu.ai/api/user/self/groups')
})

export default yunwuTokenApi
