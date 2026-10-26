import type { Context } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { randomBytes } from 'node:crypto'
import { getSystemSettings } from '../../module/system/settings'
import { dataPath } from '../storage/data-path'
import { DocumentStore } from '../storage/document-store'
import { resourceLock } from '../storage/resource-lock'
import { getRequestIdentity, signaturesEqual, signValue } from './network'
import { getAuthSecret } from './secret'

export const LOGIN_COOKIE = 'linai_login'
export const LOGIN_MAX_AGE = 30 * 24 * 60 * 60
const LOCK_MS = 5 * 60 * 1000
type Attempt = { failures: number; lockedUntil: number; updatedAt: number }
const attemptsStore = new DocumentStore<Record<string, Attempt>>(
  dataPath('system', 'login-attempts.json'),
)
const codeTag = (code: string, secret: string) =>
  signValue(`login-code:${code}`, secret)

export async function getLoginAccess(c: Context) {
  const identity = await getRequestIdentity(c)
  const { loginCode } = await getSystemSettings()
  const configured = /^\d{6}$/.test(loginCode)
  if (identity.local)
    return { ...identity, configured, authenticated: true, expiresAt: null }
  const unauthorized = {
    ...identity,
    configured,
    authenticated: false,
    expiresAt: null,
  }
  if (!configured) return unauthorized
  const cookie = getCookie(c, LOGIN_COOKIE)
  if (!cookie || cookie.length > 1024) return unauthorized
  const [body, signature] = cookie.split('.')
  if (!body || !signature) return unauthorized
  const secret = await getAuthSecret()
  if (!signaturesEqual(signature, signValue(`session:${body}`, secret)))
    return unauthorized
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (
      typeof payload.expiresAt !== 'number' ||
      payload.expiresAt <= Date.now() ||
      payload.expiresAt > Date.now() + LOGIN_MAX_AGE * 1000 ||
      payload.tag !== codeTag(loginCode, secret)
    )
      return unauthorized
    return {
      ...identity,
      configured,
      authenticated: true,
      expiresAt: payload.expiresAt as number,
    }
  } catch {
    return unauthorized
  }
}

const activeAttempt = (attempt?: Attempt) =>
  attempt && attempt.lockedUntil > 0 && attempt.lockedUntil <= Date.now()
    ? undefined
    : attempt

export async function getLoginStatus(c: Context) {
  const access = await getLoginAccess(c)
  const attempts = (await attemptsStore.get()).value ?? {}
  const attempt = activeAttempt(attempts[access.ip])
  return {
    authenticated: access.authenticated,
    local: access.local,
    configured: access.configured,
    expiresAt: access.expiresAt,
    remainingAttempts: Math.max(0, 3 - (attempt?.failures ?? 0)),
    retryAfter: Math.max(
      0,
      Math.ceil(((attempt?.lockedUntil ?? 0) - Date.now()) / 1000),
    ),
  }
}

export async function login(c: Context, code: string) {
  const { ip } = await getRequestIdentity(c)
  return resourceLock.run('system.login-attempts', async () => {
    const { loginCode } = await getSystemSettings()
    if (!/^\d{6}$/.test(loginCode))
      return {
        ok: false as const,
        status: 403 as const,
        error:
          '尚未配置登录验证码，请先在运行 LinAI 的电脑上通过 localhost 进入系统设置',
        remainingAttempts: 3,
        retryAfter: 0,
      }
    const document = await attemptsStore.get()
    const attempts = Object.fromEntries(
      Object.entries(document.value ?? {}).filter(
        ([, entry]) => Date.now() - entry.updatedAt < 24 * 60 * 60 * 1000,
      ),
    )
    const attempt = activeAttempt(attempts[ip])
    if (attempt && attempt.lockedUntil > Date.now())
      return {
        ok: false as const,
        status: 429 as const,
        error: '验证码连续输入错误三次，请五分钟后再试',
        remainingAttempts: 0,
        retryAfter: Math.ceil((attempt.lockedUntil - Date.now()) / 1000),
      }
    const secret = await getAuthSecret()
    if (
      !/^\d{6}$/.test(code) ||
      !signaturesEqual(codeTag(code, secret), codeTag(loginCode, secret))
    ) {
      const failures = (attempt?.failures ?? 0) + 1
      const retryAfter = failures >= 3 ? LOCK_MS / 1000 : 0
      if (!(ip in attempts) && Object.keys(attempts).length >= 1000)
        return {
          ok: false as const,
          status: 429 as const,
          error: '登录尝试过于频繁，请稍后重试',
          remainingAttempts: 0,
          retryAfter: 300,
        }
      attempts[ip] = {
        failures,
        lockedUntil: retryAfter ? Date.now() + LOCK_MS : 0,
        updatedAt: Date.now(),
      }
      await attemptsStore.replace(attempts, document.revision)
      return {
        ok: false as const,
        status: retryAfter ? (429 as const) : (401 as const),
        error: retryAfter
          ? '验证码连续输入错误三次，请五分钟后再试'
          : `验证码错误，还可输入 ${3 - failures} 次`,
        remainingAttempts: Math.max(0, 3 - failures),
        retryAfter,
      }
    }
    delete attempts[ip]
    if (document.value) await attemptsStore.replace(attempts, document.revision)
    const expiresAt = Date.now() + LOGIN_MAX_AGE * 1000
    const body = Buffer.from(
      JSON.stringify({
        expiresAt,
        tag: codeTag(loginCode, secret),
        nonce: randomBytes(16).toString('hex'),
      }),
    ).toString('base64url')
    setCookie(
      c,
      LOGIN_COOKIE,
      `${body}.${signValue(`session:${body}`, secret)}`,
      {
        httpOnly: true,
        sameSite: 'Strict',
        path: '/',
        maxAge: LOGIN_MAX_AGE,
        expires: new Date(expiresAt),
        secure: new URL(c.req.url).protocol === 'https:',
      },
    )
    c.header('Cache-Control', 'no-store')
    return { ok: true as const, expiresAt }
  })
}
