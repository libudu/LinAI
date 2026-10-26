import { getConnInfo } from '@hono/node-server/conninfo'
import type { Context } from 'hono'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { getAuthSecret } from './secret'

export const AUTH_PROXY_HEADER = 'x-linai-proxy-context'
export const normalizeIp = (ip: string) => ip.replace(/^::ffff:/, '')
export const isLoopback = (ip: string) =>
  ip === '::1' || /^127\.\d+\.\d+\.\d+$/.test(normalizeIp(ip))
export const signValue = (value: string, secret: string) =>
  createHmac('sha256', secret).update(value).digest('base64url')
export function signaturesEqual(left: string, right: string) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** 开发代理覆盖外部传入的同名头，并签名原始连接信息，禁止通过伪造 Host/XFF 绕过 localhost。 */
export function signProxyContext(ip: string, host: string, secret: string) {
  const body = Buffer.from(
    JSON.stringify({ ip, host, time: Date.now() }),
  ).toString('base64url')
  return `${body}.${signValue(`proxy:${body}`, secret)}`
}

export async function getRequestIdentity(c: Context) {
  let ip = normalizeIp(getConnInfo(c).remote.address || '')
  let host = new URL(c.req.url).hostname
  let forwarded = Boolean(
    c.req.header('forwarded') ||
    c.req.header('x-forwarded-for') ||
    c.req.header('x-forwarded-host'),
  )
  const proxy = c.req.header(AUTH_PROXY_HEADER)
  if (proxy !== undefined) forwarded = true
  if (isLoopback(ip) && proxy && proxy.length < 2048) {
    const [body, signature] = proxy.split('.')
    if (
      body &&
      signature &&
      signaturesEqual(
        signValue(`proxy:${body}`, await getAuthSecret()),
        signature,
      )
    ) {
      try {
        const value = JSON.parse(Buffer.from(body, 'base64url').toString())
        if (
          typeof value.ip === 'string' &&
          typeof value.host === 'string' &&
          typeof value.time === 'number' &&
          Math.abs(Date.now() - value.time) < 30000
        ) {
          ip = normalizeIp(value.ip)
          host = new URL(`http://${value.host}`).hostname
          forwarded = false
        }
      } catch {
        /* 无效代理信息不能获得 localhost 豁免。 */
      }
    }
  }
  const hostname = host.toLowerCase().replace(/^\[|\]$/g, '')
  return {
    ip: ip || 'unknown',
    local:
      isLoopback(ip) &&
      (hostname === 'localhost' || isLoopback(hostname)) &&
      !forwarded &&
      c.req.header('sec-fetch-site') !== 'cross-site',
  }
}
