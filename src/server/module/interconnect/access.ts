import { randomBytes, timingSafeEqual } from 'node:crypto'

// 房间邀请与 Eagle 会话分离；仅服务端保存邀请能力，旧八位权限键不再是登录凭据。
type Grant = {
  code: string
  secret: string
  expiresAt: number
}
const grants = new Map<string, Grant>()

export function issueRoomGrant(code: string, expiresAt: number) {
  const secret = randomBytes(32).toString('hex')
  grants.set(code, { code, secret, expiresAt })
  return secret
}

export function findRoomGrant(secret: string) {
  if (!/^[a-f0-9]{64}$/.test(secret)) return undefined
  return [...grants.values()].find(
    (grant) =>
      grant.expiresAt > Date.now() &&
      timingSafeEqual(Buffer.from(grant.secret), Buffer.from(secret)),
  )
}

export function hasRoomGrant(code: string, secret: string) {
  return findRoomGrant(secret)?.code === code
}

export function revokeRoomGrant(code?: string) {
  if (code) grants.delete(code)
  else grants.clear()
}
