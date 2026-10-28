import type { AppType } from '@/server'
import { hc } from 'hono/client'
import { ensureEagleOwnerSession } from './sharing/access'

export const eagleRpc = hc<AppType>('/', {
  fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
    // 未启用共享的旧 LAN 浏览方式继续由既有接口权限决定。
    await ensureEagleOwnerSession().catch(() => undefined)
    return fetch(input, init)
  },
}).api.eagle
