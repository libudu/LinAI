import { HTTPException } from 'hono/http-exception'
import { randomBytes, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { changeBus } from '../../../common/storage/change-bus'
import { getSystemSettings } from '../../system/settings'
import { refreshIndex } from '../library'
import {
  getEagleFolderSharingSettings,
  getEagleSettings,
  getEagleSharingSettings,
} from '../settings'
import { validateLibraryDirectory } from './paths'

const LEASE_MS = 12000
const REQUEST_MS = 120000
const instanceId = randomUUID()
const stateSchema = z.enum(['pending', 'approved', 'closed', 'error'])
type State = z.infer<typeof stateSchema>
type Transfer = { bytes: number; samples: { time: number; bytes: number }[] }
type Incoming = Transfer & {
  id: string
  token: string
  name: string
  invitationCode: string
  state: State
  createdAt: number
  lastSeen: number
  closedAt?: number
  error?: string
  owner?: string
  libraryPath: string
  controller: AbortController
  readController: AbortController
}
type Outgoing = {
  id: string
  token: string
  url: string
  localPath: string
  invitationCode: string
  state: State
  error: string
  controller: AbortController
  checking: boolean
  permissionsRevision?: number
}

const pages = new Map<string, symbol>()
const incoming = new Map<string, Incoming>()
const outgoing = new Map<string, Outgoing>()
let attempts: number[] = []

function fail(message: string): never {
  throw new HTTPException(409, { message })
}
export function requirePage(pageId: string) {
  if (!pages.has(pageId)) fail('当前前端页面未连接，请刷新页面后重试')
}

function terminate(
  session: Incoming,
  error = '共享连接已终止，请重新请求授权',
) {
  if (session.state === 'closed') return
  session.state = 'closed'
  session.closedAt = Date.now()
  session.error = error
  session.controller.abort()
}

export function disconnectRemote(pageId: string) {
  const session = outgoing.get(pageId)
  outgoing.delete(pageId)
  if (!session) return
  session.controller.abort()
  if (session.token)
    void remoteJson(session.url, '/session/close', session.token, {}).catch(
      () => undefined,
    )
}

export function openPage(pageId: string) {
  // 同一页面的 SSE 重连也必须重新授权，不恢复旧会话。
  closePage(pageId)
  const identity = Symbol()
  pages.set(pageId, identity)
  return () => {
    if (pages.get(pageId) === identity) closePage(pageId)
  }
}

export function closePage(pageId: string) {
  pages.delete(pageId)
  disconnectRemote(pageId)
  for (const session of incoming.values()) {
    if (
      session.owner === pageId ||
      (pages.size === 0 && session.state === 'pending')
    )
      terminate(session, '共享方已关闭前端页面')
  }
}

export function normalizeRemoteUrl(input: string) {
  const url = new URL(input)
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    fail('目标 LinAI 地址必须是无账号、查询参数和片段的 HTTP(S) URL')
  return url.href.replace(/\/+$/, '')
}

async function remoteJson(
  url: string,
  endpoint: string,
  token?: string,
  body?: object,
  signal?: AbortSignal,
) {
  const response = await fetch(`${url}/api/eagle/sharing${endpoint}`, {
    method: 'POST',
    redirect: 'error',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.any([
      AbortSignal.timeout(8000),
      ...(signal ? [signal] : []),
    ]),
  })
  let json
  try {
    json = await response.json()
  } catch {
    fail(`目标 LinAI 返回了无效响应（${response.status}）`)
  }
  if (!response.ok || !json?.success)
    fail(json?.error?.message || `目标 LinAI 请求失败（${response.status}）`)
  const parsed = z
    .object({
      id: z.string().uuid().optional(),
      token: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .optional(),
      state: stateSchema.optional(),
      permissionsRevision: z.number().int().nonnegative().optional(),
    })
    .safeParse(json.data ?? {})
  if (!parsed.success) fail('目标 LinAI 返回了不兼容的共享协议数据')
  return parsed.data
}

export async function requestSharing(
  invitationCode: string,
  requesterInstance: string,
) {
  const now = Date.now()
  attempts = attempts.filter((time) => now - time < 60000)
  if (attempts.length >= 30) fail('共享请求过于频繁，请稍后重试')
  attempts.push(now)
  if (requesterInstance === instanceId) fail('不能连接到自己的 LinAI')
  if (!pages.size) fail('对方尚未打开 LinAI 前端页面')
  if (!/^\d{6}$/.test((await getSystemSettings()).loginCode))
    fail('共享方尚未配置系统登录验证码，无法共享 Eagle 资源库')
  const settings = await getEagleSettings()
  if (settings.libraryMode !== 'local' || !settings.libraryPath)
    fail('对方没有可共享的本地 Eagle 资源库')
  const user = (await getEagleSharingSettings()).users.find(
    (user) => user.invitationCode === invitationCode,
  )
  if (!user) fail('邀请码无效或共享用户已删除')
  if (incoming.size >= 100) fail('共享连接数量已达上限，请稍后重试')
  if (
    [...incoming.values()].some(
      (session) =>
        session.invitationCode === invitationCode &&
        session.state === 'pending',
    )
  )
    fail('该用户已有共享请求正在等待同意')
  const session: Incoming = {
    id: randomUUID(),
    token: randomBytes(32).toString('hex'),
    ...user,
    state: 'pending',
    createdAt: now,
    lastSeen: now,
    libraryPath: settings.libraryPath,
    controller: new AbortController(),
    readController: new AbortController(),
    bytes: 0,
    samples: [],
  }
  if (!pages.size) fail('对方已关闭 LinAI 前端页面')
  incoming.set(session.token, session)
  return { id: session.id, token: session.token, state: session.state }
}

async function validIncoming(token: string) {
  const session = incoming.get(token)
  if (!session) fail('共享连接已终止，请重新请求授权')
  if (session.state === 'closed' || session.controller.signal.aborted)
    fail(session.error || '共享连接已终止，请重新请求授权')
  if (
    Date.now() - session.lastSeen > LEASE_MS ||
    (session.state === 'pending' && Date.now() - session.createdAt > REQUEST_MS)
  ) {
    terminate(session, '共享连接已超时，请重新请求授权')
    fail('共享连接已超时，请重新请求授权')
  }
  const [settings, sharing, system] = await Promise.all([
    getEagleSettings(),
    getEagleSharingSettings(),
    getSystemSettings(),
  ])
  if (
    !pages.size ||
    !/^\d{6}$/.test(system.loginCode) ||
    (session.owner && !pages.has(session.owner)) ||
    settings.libraryMode !== 'local' ||
    settings.libraryPath !== session.libraryPath ||
    !sharing.users.some(
      (user) => user.invitationCode === session.invitationCode,
    )
  ) {
    terminate(session, '共享方已离线、切换资源库或取消了此用户的授权')
    fail('共享方已离线、切换资源库或取消了此用户的授权')
  }
  // 读取设置期间也可能关闭页面。
  if (session.controller.signal.aborted) fail('共享连接已终止')
  return session
}

export async function heartbeatIncoming(token: string) {
  const session = await validIncoming(token)
  session.lastSeen = Date.now()
  const permissions = await getEagleFolderSharingSettings()
  return { state: session.state, permissionsRevision: permissions.revision }
}

export function closeIncoming(token: string) {
  const session = incoming.get(token)
  if (session) terminate(session, '请求方已断开共享连接')
}

export async function decideSharing(
  pageId: string,
  id: string,
  approve: boolean,
) {
  requirePage(pageId)
  const session = [...incoming.values()].find((session) => session.id === id)
  if (!session || session.state !== 'pending')
    fail('该共享请求已被处理或已失效')
  await validIncoming(session.token)
  if (!approve) {
    terminate(session, '对方拒绝了共享请求')
    return
  }
  try {
    await validateLibraryDirectory(session.libraryPath, false)
    await refreshIndex()
    await validIncoming(session.token)
  } catch (error) {
    terminate(
      session,
      error instanceof Error ? error.message : '共享方资源库加载失败',
    )
    throw error
  }
  requirePage(pageId)
  if (session.state !== 'pending' || session.controller.signal.aborted)
    fail('该共享请求已失效')
  session.owner = pageId
  session.state = 'approved'
}

export async function authorizeRead(token: string) {
  const session = await validIncoming(token)
  if (session.state !== 'approved') fail('共享请求尚未获得同意')
  return session
}

export function recordTransfer(session: Incoming, bytes: number) {
  session.bytes += bytes
  const time = Math.floor(Date.now() / 1000) * 1000
  const last = session.samples.at(-1)
  if (last?.time === time) last.bytes += bytes
  else session.samples.push({ time, bytes })
  session.samples = session.samples.filter(
    (sample) => Date.now() - sample.time < 5000,
  )
}

export async function connectRemote(
  pageId: string,
  config: {
    url: string
    localPath: string
    invitationCode: string
  },
) {
  requirePage(pageId)
  const directory = await validateLibraryDirectory(config.localPath)
  const url = normalizeRemoteUrl(config.url)
  requirePage(pageId)
  disconnectRemote(pageId)
  const session: Outgoing = {
    id: randomUUID(),
    token: '',
    url,
    localPath: directory.path,
    invitationCode: config.invitationCode,
    state: 'pending',
    error: '',
    controller: new AbortController(),
    checking: false,
  }
  outgoing.set(pageId, session)
  try {
    const result = await remoteJson(
      url,
      '/request',
      undefined,
      { invitationCode: config.invitationCode, instanceId },
      session.controller.signal,
    )
    if (!result.token || !result.id || result.state !== 'pending')
      fail('目标 LinAI 返回了不兼容的共享请求响应')
    if (outgoing.get(pageId) !== session || session.controller.signal.aborted) {
      void remoteJson(url, '/session/close', result.token, {}).catch(
        () => undefined,
      )
      fail('共享连接已取消')
    }
    session.token = result.token
    return { id: session.id, localPath: directory.path }
  } catch (error) {
    session.state = 'error'
    session.error =
      error instanceof Error ? error.message : '无法连接目标 LinAI'
    throw new HTTPException(409, { message: session.error })
  }
}

export function sharingSnapshot(pageId: string) {
  requirePage(pageId)
  const session = outgoing.get(pageId)
  return {
    incoming: [...incoming.values()]
      .filter(
        (entry) => entry.state === 'pending' || entry.state === 'approved',
      )
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        invitationCode: entry.invitationCode,
        state: entry.state,
        bytes: entry.bytes,
        bytesPerSecond:
          entry.samples
            .filter((sample) => Date.now() - sample.time < 5000)
            .reduce((total, sample) => total + sample.bytes, 0) / 5,
        tasks: [] as string[],
      })),
    outgoing: session
      ? {
          id: session.id,
          state: session.state,
          error: session.error,
          url: session.url,
          localPath: session.localPath,
          permissionsRevision: session.permissionsRevision,
        }
      : null,
  }
}

export async function getRemoteConnection(pageId: string) {
  requirePage(pageId)
  const session = outgoing.get(pageId)
  if (
    !session ||
    session.state !== 'approved' ||
    session.controller.signal.aborted
  )
    fail('远程资源库尚未连接或连接已终止，请在设置中重新连接')
  const settings = await getEagleSettings()
  if (
    normalizeRemoteUrl(settings.remoteUrl) !== session.url ||
    settings.remoteLibraryPath !== session.localPath ||
    settings.invitationCode !== session.invitationCode
  )
    fail('远程资源库配置已改变，请重新连接')
  return session
}

// 心跳由服务端持续发送，避免后台浏览器定时器节流误断线；页面 SSE 是连接存活的前提。
const timer = setInterval(() => {
  const now = Date.now()
  for (const [token, session] of incoming) {
    if (
      session.state !== 'closed' &&
      (now - session.lastSeen > LEASE_MS ||
        (session.state === 'pending' && now - session.createdAt > REQUEST_MS))
    )
      terminate(session, '共享连接已超时，请重新请求授权')
    if (session.closedAt && now - session.closedAt > 15000)
      incoming.delete(token)
  }
  for (const [pageId, session] of outgoing) {
    if (!pages.has(pageId)) {
      disconnectRemote(pageId)
      continue
    }
    if (
      !session.token ||
      session.checking ||
      !['pending', 'approved'].includes(session.state)
    )
      continue
    session.checking = true
    void remoteJson(
      session.url,
      '/session/heartbeat',
      session.token,
      {},
      session.controller.signal,
    )
      .then((result) => {
        if (session.controller.signal.aborted) return
        if (!result.state) fail('目标 LinAI 返回了无效的共享连接状态')
        session.state = result.state
        session.permissionsRevision = result.permissionsRevision
        if (result.state === 'closed')
          session.error = '对方拒绝了请求或共享连接已终止'
      })
      .catch((error) => {
        session.state = 'error'
        session.error = error instanceof Error ? error.message : '远程连接中断'
        session.controller.abort()
      })
      .finally(() => {
        session.checking = false
      })
  }
}, 2000)
timer.unref()

// 修改文件夹权限时立即中止旧范围的在途传输；会话保留，新请求使用新权限。
changeBus.subscribe('settings.eagle-folder-sharing', () => {
  for (const session of incoming.values()) {
    session.readController.abort()
    session.readController = new AbortController()
  }
})

// 删除用户或切换库后立即撤销在途读取，不能等下一次媒体请求才发现。
for (const resource of [
  'settings.eagle',
  'settings.eagle-sharing',
  'settings.system',
]) {
  changeBus.subscribe(resource, () => {
    for (const session of incoming.values()) {
      if (session.state === 'closed') continue
      void validIncoming(session.token).catch(() => terminate(session))
    }
  })
}
