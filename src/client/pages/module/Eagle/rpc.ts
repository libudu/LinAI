import type { AppType } from '@/server'
import { hc } from 'hono/client'
import { v4 as uuid } from 'uuid'
import { ensureEagleOwnerSession } from './sharing/access'

// 每次完整页面加载独立身份；不落盘，关闭/刷新后必须重新获得共享授权。
export const eaglePageId = uuid()

export const eagleRpc = hc<AppType>('/', {
  fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
    // 未启用共享的旧 LAN 浏览方式继续由既有接口权限决定。
    await ensureEagleOwnerSession().catch(() => undefined)
    const headers = new Headers(init?.headers)
    headers.set('x-eagle-page', eaglePageId)
    return fetch(input, { ...init, headers })
  },
}).api.eagle
