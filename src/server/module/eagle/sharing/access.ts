import { getConnInfo } from '@hono/node-server/conninfo'
import type { Context, Next } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { HTTPException } from 'hono/http-exception'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { networkInterfaces } from 'node:os'
import { getEagleSharingSettings } from '../settings'

// 共享凭据只授权共享协议。管理凭据仅发给本机浏览器，防止对方绕过只读入口
// 调用原有的无鉴权 Eagle 写接口、读取邀请码或自行同意请求。
const ownerToken = randomBytes(32).toString('hex')
const COOKIE = 'linai_eagle_owner'
const normalizeIp = (ip: string) => ip.replace(/^::ffff:/, '')

function isOwner(c: Context) {
  const token = getCookie(c, COOKIE)
  return Boolean(
    token &&
    /^[a-f0-9]{64}$/.test(token) &&
    timingSafeEqual(Buffer.from(token), Buffer.from(ownerToken)),
  )
}

export function issueOwnerSession(c: Context) {
  const peer = getConnInfo(c).remote.address
  const addresses = new Set([
    '127.0.0.1',
    '::1',
    ...Object.values(networkInterfaces()).flatMap((entries) =>
      (entries ?? []).map((entry) => normalizeIp(entry.address)),
    ),
  ])
  const hostname = new URL(c.req.url).hostname.replace(/^\[|\]$/g, '')
  if (
    !peer ||
    !addresses.has(normalizeIp(peer)) ||
    !(hostname === 'localhost' || addresses.has(normalizeIp(hostname))) ||
    c.req.header('x-forwarded-for') ||
    c.req.header('forwarded') ||
    c.req.header('sec-fetch-site') === 'cross-site'
  ) {
    throw new HTTPException(403, {
      message: 'Eagle 共享管理需在运行此 LinAI 的电脑上打开本地地址操作',
    })
  }
  setCookie(c, COOKIE, ownerToken, {
    httpOnly: true,
    sameSite: 'Strict',
    path: '/',
    secure: new URL(c.req.url).protocol === 'https:',
  })
  return c.json({ success: true as const, data: null })
}

export async function guardEagleAccess(c: Context, next: Next) {
  const path = c.req.path
  if (path === '/api/eagle/sharing/local-session') return next()
  const protocol =
    path === '/api/eagle/sharing/request' ||
    /^\/api\/eagle\/sharing\/session\/(heartbeat|close)$/.test(path) ||
    path.startsWith('/api/eagle/sharing/library/')
  if (protocol) return next()
  const settingId = path.startsWith('/api/settings/')
    ? decodeURIComponent(path.slice('/api/settings/'.length))
    : ''
  const management =
    path.startsWith('/api/eagle/sharing/') || settingId === 'eagle-sharing'
  if (management || (await getEagleSharingSettings()).users.length > 0) {
    if (!isOwner(c))
      throw new HTTPException(403, {
        message:
          '此入口需要本机 Eagle 管理会话；远程用户请使用已授权的只读共享连接',
      })
  }
  return next()
}
