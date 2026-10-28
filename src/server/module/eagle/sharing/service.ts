import { HTTPException } from 'hono/http-exception'
import { randomBytes, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { changeBus } from '../../../common/storage/change-bus'
import { findRoomGrant, hasRoomGrant } from '../../interconnect/access'
import { fetchRoomResource } from '../../interconnect/https'
import { refreshIndex } from '../library'
import {
  getEagleFolderSharingSettings,
  getEagleSettings,
  getEagleSharingSettings,
} from '../settings'
import { validateLibraryDirectory } from './paths'

const LEASE_MS = 12000
const CONNECT_MS = 120000
const instanceId = randomUUID()
const stateSchema = z.enum(['connecting', 'approved', 'closed', 'error'])
type State = z.infer<typeof stateSchema>
type Transfer = { bytes: number; samples: { time: number; bytes: number }[] }
type Incoming = Transfer & {
  id: string
  token: string
  name: string
  invitationCode: string
  roomSecret: string
  folderSharingCode: string
  state: State
  lastSeen: number
  closedAt?: number
  error?: string
  libraryPath: string
  controller: AbortController
  readController: AbortController
}
type Outgoing = Transfer & {
  id: string
  token: string
  url: string
  certificate: string
  invitationCode: string
  state: State
  error: string
  controller: AbortController
  checking: boolean
  permissionsRevision?: number
}

const incoming = new Map<string, Incoming>()
const outgoing = new Map<string, Outgoing>()
const CONNECTION = 'interconnect'
let attempts: number[] = []

function fail(message: string): never {
  throw new HTTPException(409, { message })
}

function terminate(
  session: Incoming,
  error = '共享连接已终止，请重新连接远程资源库',
) {
  if (session.state === 'closed') return
  session.state = 'closed'
  session.closedAt = Date.now()
  session.error = error
  session.controller.abort()
}

export function disconnectRemote() {
  const session = outgoing.get(CONNECTION)
  outgoing.delete(CONNECTION)
  if (!session) return
  session.controller.abort()
  if (session.token)
    void remoteJson(
      session.url,
      session.certificate,
      '/session/close',
      session.token,
      {},
    ).catch(() => undefined)
}

export function revokeSharing(code?: string) {
  for (const session of incoming.values())
    if (!code || session.invitationCode === code)
      terminate(session, '房间成员授权已撤销')
}

export function normalizeRemoteUrl(input: string) {
  const url = new URL(input)
  if (
    url.protocol !== 'https:' ||
    url.hostname !== '127.0.0.1' ||
    url.pathname !== '/' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    fail('房间资源只能通过本地的固定 TLS 转发访问')
  return url.href.replace(/\/+$/, '')
}

async function remoteJson(
  url: string,
  certificate: string,
  endpoint: string,
  token?: string,
  body?: object,
  signal?: AbortSignal,
  timeoutMs = 8000,
) {
  const response = await fetchRoomResource(
    `${url}/api/eagle/sharing${endpoint}`,
    certificate,
    {
      method: 'POST',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.any([
        AbortSignal.timeout(timeoutMs),
        ...(signal ? [signal] : []),
      ]),
    },
  )
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
  const grant = findRoomGrant(invitationCode)
  if (!grant) fail('房间邀请已过期或撤销')
  const settings = await getEagleSettings()
  if (settings.libraryMode !== 'local' || !settings.libraryPath)
    fail('对方没有可共享的本地 Eagle 资源库')
  const user = (await getEagleSharingSettings()).users.find(
    (user) => user.invitationCode === grant.code,
  )
  if (!user) fail('邀请无效或权限组已删除')
  // 邀请已确定权限组，连接时直接准备只读资源库，无需房主再次审批。
  await validateLibraryDirectory(settings.libraryPath, false)
  await refreshIndex()
  if (incoming.size >= 100) fail('共享连接数量已达上限，请稍后重试')
  const session: Incoming = {
    id: randomUUID(),
    token: randomBytes(32).toString('hex'),
    ...user,
    roomSecret: invitationCode,
    folderSharingCode: user.folderSharingCode ?? user.invitationCode,
    state: 'approved',
    lastSeen: Date.now(),
    libraryPath: settings.libraryPath,
    controller: new AbortController(),
    readController: new AbortController(),
    bytes: 0,
    samples: [],
  }
  incoming.set(session.token, session)
  try {
    // 加载资源库期间可能已经撤销邀请、删除权限组或切库。
    await validIncoming(session.token)
  } catch (error) {
    terminate(session)
    throw error
  }
  return { id: session.id, token: session.token, state: session.state }
}

async function validIncoming(token: string) {
  const session = incoming.get(token)
  if (!session) fail('共享连接已终止，请重新连接远程资源库')
  if (session.state === 'closed' || session.controller.signal.aborted)
    fail(session.error || '共享连接已终止，请重新连接远程资源库')
  if (Date.now() - session.lastSeen > LEASE_MS) {
    terminate(session, '共享连接已超时，请重新连接远程资源库')
    fail('共享连接已超时，请重新连接远程资源库')
  }
  const [settings, sharing] = await Promise.all([
    getEagleSettings(),
    getEagleSharingSettings(),
  ])
  const user = sharing.users.find(
    (user) =>
      user.invitationCode === session.invitationCode &&
      (user.folderSharingCode ?? user.invitationCode) ===
        session.folderSharingCode,
  )
  if (
    !hasRoomGrant(session.invitationCode, session.roomSecret) ||
    settings.libraryMode !== 'local' ||
    settings.libraryPath !== session.libraryPath ||
    !user
  ) {
    terminate(session, '共享方已离线、切换资源库或取消了此权限组的授权')
    fail('共享方已离线、切换资源库或取消了此权限组的授权')
  }
  // 读取设置期间也可能撤销成员。
  if (session.controller.signal.aborted) fail('共享连接已终止')
  session.name = user.name
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

export async function authorizeRead(token: string) {
  const session = await validIncoming(token)
  if (session.state !== 'approved') fail('共享连接尚未就绪')
  return session
}

export function recordTransfer(session: Transfer, bytes: number) {
  session.bytes += bytes
  const time = Math.floor(Date.now() / 1000) * 1000
  const last = session.samples.at(-1)
  if (last?.time === time) last.bytes += bytes
  else session.samples.push({ time, bytes })
  session.samples = session.samples.filter(
    (sample) => Date.now() - sample.time < 5000,
  )
}

function transferSnapshot(session: Transfer) {
  return {
    bytes: session.bytes,
    bytesPerSecond:
      session.samples
        .filter((sample) => Date.now() - sample.time < 5000)
        .reduce((total, sample) => total + sample.bytes, 0) / 5,
  }
}

export async function connectRemote(config: {
  url: string
  certificate: string
  invitationCode: string
}) {
  const url = normalizeRemoteUrl(config.url)
  disconnectRemote()
  const session: Outgoing = {
    id: randomUUID(),
    token: '',
    url,
    certificate: config.certificate,
    invitationCode: config.invitationCode,
    state: 'connecting',
    error: '',
    bytes: 0,
    samples: [],
    controller: new AbortController(),
    checking: false,
  }
  outgoing.set(CONNECTION, session)
  try {
    const result = await remoteJson(
      url,
      config.certificate,
      '/request',
      undefined,
      { invitationCode: config.invitationCode, instanceId },
      session.controller.signal,
      CONNECT_MS,
    )
    if (!result.token || !result.id || result.state !== 'approved')
      fail('目标 LinAI 返回了不兼容的共享连接响应，请确认双方已更新 LinAI')
    if (
      outgoing.get(CONNECTION) !== session ||
      session.controller.signal.aborted
    ) {
      void remoteJson(
        url,
        config.certificate,
        '/session/close',
        result.token,
        {},
      ).catch(() => undefined)
      fail('共享连接已取消')
    }
    session.token = result.token
    session.state = 'approved'
    return { id: session.id }
  } catch (error) {
    session.state = 'error'
    session.error =
      error instanceof Error ? error.message : '无法连接目标 LinAI'
    throw new HTTPException(409, { message: session.error })
  }
}

export function sharingSnapshot() {
  const session = outgoing.get(CONNECTION)
  return {
    incoming: [...incoming.values()]
      .filter((entry) => entry.state === 'approved')
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        memberName: findRoomGrant(entry.roomSecret)?.memberName,
        invitationCode: entry.invitationCode,
        state: entry.state,
        ...transferSnapshot(entry),
        tasks: [] as string[],
      })),
    outgoing: session
      ? {
          id: session.id,
          state: session.state,
          error: session.error,
          url: session.url,
          ...transferSnapshot(session),
          permissionsRevision: session.permissionsRevision,
        }
      : null,
  }
}

export async function getRemoteConnection() {
  const session = outgoing.get(CONNECTION)
  if (
    !session ||
    session.state !== 'approved' ||
    session.controller.signal.aborted
  )
    fail('远程资源库尚未连接或连接已终止，请在设置中重新连接')
  return session
}

// 后端心跳不依赖浏览器页面；退出房间、撤销权限及租约到期仍立即终止传输。
const timer = setInterval(() => {
  const now = Date.now()
  for (const [token, session] of incoming) {
    if (session.state !== 'closed' && now - session.lastSeen > LEASE_MS)
      terminate(session, '共享连接已超时，请重新连接远程资源库')
    if (session.closedAt && now - session.closedAt > 15000)
      incoming.delete(token)
  }
  for (const session of outgoing.values()) {
    if (!session.token || session.checking || session.state !== 'approved')
      continue
    session.checking = true
    void remoteJson(
      session.url,
      session.certificate,
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
        if (result.state === 'closed') session.error = '共享连接已终止'
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

// 删除权限组或切换库后立即撤销在途读取，不能等下一次媒体请求才发现。
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
