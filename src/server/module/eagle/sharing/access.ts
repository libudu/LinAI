import type { Context, Next } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { HTTPException } from 'hono/http-exception'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { getLoginAccess } from '../../../common/auth/service'
import { getEagleSharingSettings } from '../settings'
import { isEagleSharingProtocol } from './protocol'

// 系统登录与共享协议分离；浏览器在系统鉴权后单独建立 Eagle 管理会话。
// 服务端共享客户端仅持有只读共享凭据，不取得系统登录和管理 Cookie。
const ownerToken = randomBytes(32).toString('hex')

// Cookie 不按端口隔离；开发版与便携版并行运行时必须使用不同名称。
// 开发代理会改写目标地址，因此同一后端的代理入口与直连入口使用同一个名称。
function ownerCookie(c: Context) {
  const url = new URL(c.req.url)
  const port = url.port || (url.protocol === 'https:' ? '443' : '80')
  return `linai_eagle_owner_${port}`
}

function isOwner(c: Context) {
  const token = getCookie(c, ownerCookie(c))
  return Boolean(
    token &&
    /^[a-f0-9]{64}$/.test(token) &&
    timingSafeEqual(Buffer.from(token), Buffer.from(ownerToken)),
  )
}

export async function issueOwnerSession(c: Context) {
  const access = await getLoginAccess(c)
  if (!access.authenticated) {
    throw new HTTPException(403, {
      message: '请先完成系统登录鉴权',
    })
  }
  setCookie(c, ownerCookie(c), ownerToken, {
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
  if (isEagleSharingProtocol(c.req.method, path)) return next()
  const settingId = path.startsWith('/api/settings/')
    ? decodeURIComponent(path.slice('/api/settings/'.length))
    : ''
  const management =
    path.startsWith('/api/interconnect/') ||
    path.startsWith('/api/eagle/sharing/') ||
    settingId === 'interconnect' ||
    settingId === 'eagle-sharing' ||
    settingId === 'eagle-folder-sharing'
  if (management || (await getEagleSharingSettings()).users.length > 0) {
    if (!isOwner(c))
      throw new HTTPException(403, {
        message:
          '此入口需要本机 Eagle 管理会话；远程用户请使用已授权的只读共享连接',
      })
  }
  return next()
}
