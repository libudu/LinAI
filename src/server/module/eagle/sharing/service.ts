import { HTTPException } from 'hono/http-exception'
import { randomBytes, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { changeBus } from '../../../common/storage/change-bus'
import { findRoomGrant, hasRoomGrant } from '../../interconnect/access'
import type { RoomTransport } from '../../interconnect/https'
import {
  getMemberIdentity,
  recordMemberLogin,
  saveMemberIdentity,
  type MemberLogin,
} from '../../interconnect/members'
import { getSystemSettings } from '../../system/settings'
import { ensureLibraryReady } from '../library'
import {
  getEagleFolderSharingSettings,
  getEagleSettings,
  getEagleSharingSettings,
} from '../settings'
import { downloadSnapshot, type DownloadProgress } from './download-state'
import { validateLibraryDirectory } from './paths'

const LEASE_MS = 12000
const CONNECT_MS = 120000
const instanceId = randomUUID()
const stateSchema = z.enum([
  'connecting',
  'pending',
  'approved',
  'closed',
  'error',
])
type State = z.infer<typeof stateSchema>
type Transfer = { bytes: number; samples: { time: number; bytes: number }[] }
type Incoming = Transfer & {
  id: string
  token: string
  name: string
  invitationCode: string
  roomSecret?: string
  folderSharingCode: string
  memberId: string
  memberName: string
  address: string
  state: State
  lastSeen: number
  createdAt: number
  closedAt?: number
  error?: string
  libraryPath: string
  controller: AbortController
  readController: AbortController
  downloads: (DownloadProgress & { folder: string })[]
}
type Outgoing = Transfer & {
  id: string
  token: string
  url: string
  transport: RoomTransport
  invitationCode: string
  state: State
  error: string
  controller: AbortController
  checking: boolean
  permissionsRevision?: number
}

const incoming = new Map<string, Incoming>()
const outgoing = new Map<string, Outgoing>()
const CONNECTION = 'eagle'
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
      session.transport,
      '/session/close',
      session.token,
      {},
    ).catch(() => undefined)
}

export function revokeSharing(code?: string) {
  for (const session of incoming.values())
    if (session.roomSecret && (!code || session.invitationCode === code))
      terminate(session, '房间成员授权已撤销')
}

export function normalizeRemoteUrl(input: string) {
  const url = new URL(input)
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.pathname !== '/' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    fail('目标 LinAI 地址必须是无路径、账号、查询参数和片段的 HTTP(S) URL')
  return url.href.replace(/\/+$/, '')
}

/** 直接访问共享方，仅向固定目标发送共享协议请求，不携带本机管理 Cookie。 */
function directTransport(input: string): RoomTransport {
  const url = normalizeRemoteUrl(input)
  return {
    url,
    fetch(path, init) {
      const target = new URL(path, `${url}/`)
      if (
        target.origin !== url ||
        !target.pathname.startsWith('/api/eagle/sharing/')
      )
        fail('共享请求目标不匹配')
      return fetch(target, { ...init, redirect: 'error', credentials: 'omit' })
    },
    close() {},
  }
}

async function remoteJson(
  transport: RoomTransport,
  endpoint: string,
  token?: string,
  body?: object,
  signal?: AbortSignal,
  timeoutMs = 8000,
) {
  const response = await transport.fetch(`/api/eagle/sharing${endpoint}`, {
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
  requester: { member?: MemberLogin; address: string },
) {
  const now = Date.now()
  attempts = attempts.filter((time) => now - time < 60000)
  if (attempts.length >= 30) fail('共享请求过于频繁，请稍后重试')
  attempts.push(now)
  if (requesterInstance === instanceId) fail('不能连接到自己的 LinAI')
  const direct = /^[A-Za-z0-9]{8}$/.test(invitationCode)
  const grant = direct ? undefined : findRoomGrant(invitationCode)
  if (!direct && !grant) fail('房间邀请已过期或撤销')
  if (grant && !grant.memberId) fail('房间成员尚未登记，请稍后重新连接')
  if (direct && !/^\d{6}$/.test((await getSystemSettings()).loginCode))
    fail('共享方尚未配置系统登录验证码，无法共享 Eagle 资源库')
  const memberId = grant?.memberId ?? requester.member?.id ?? requesterInstance
  const settings = await getEagleSettings()
  if (settings.libraryMode !== 'local' || !settings.libraryPath)
    fail('对方没有可共享的本地 Eagle 资源库')
  const user = (await getEagleSharingSettings()).users.find(
    (user) => user.invitationCode === (grant?.code ?? invitationCode),
  )
  if (!user) fail('邀请码无效或共享用户已删除')
  if (!direct) {
    await validateLibraryDirectory(settings.libraryPath, false)
    await ensureLibraryReady()
  }
  if (incoming.size >= 100) fail('共享连接数量已达上限，请稍后重试')
  if (
    direct &&
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
    roomSecret: direct ? undefined : invitationCode,
    folderSharingCode: user.folderSharingCode ?? user.invitationCode,
    memberId,
    memberName: grant?.memberName ?? requester.member?.name ?? user.name,
    address: requester.address,
    state: direct ? 'pending' : 'approved',
    createdAt: Date.now(),
    lastSeen: Date.now(),
    libraryPath: settings.libraryPath,
    controller: new AbortController(),
    readController: new AbortController(),
    bytes: 0,
    samples: [],
    downloads: [],
  }
  incoming.set(session.token, session)
  try {
    // 加载资源库期间可能已经撤销邀请、删除权限组或切库。
    // 在握手中提供权限版本，避免首次心跳补充版本时重复加载首屏。
    const status = await heartbeatIncoming(session.token)
    return { id: session.id, token: session.token, ...status }
  } catch (error) {
    terminate(session)
    throw error
  }
}

async function validIncoming(token: string) {
  const session = incoming.get(token)
  if (!session) fail('共享连接已终止，请重新连接远程资源库')
  if (session.state === 'closed' || session.controller.signal.aborted)
    fail(session.error || '共享连接已终止，请重新连接远程资源库')
  if (
    Date.now() - session.lastSeen > LEASE_MS ||
    (session.state === 'pending' && Date.now() - session.createdAt > CONNECT_MS)
  ) {
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
    (session.roomSecret
      ? !hasRoomGrant(session.invitationCode, session.roomSecret) ||
        findRoomGrant(session.roomSecret)?.memberId !== session.memberId
      : !/^\d{6}$/.test((await getSystemSettings()).loginCode)) ||
    settings.libraryMode !== 'local' ||
    settings.libraryPath !== session.libraryPath ||
    !user
  ) {
    terminate(session, '共享方已离线、切换资源库或取消了此用户的授权')
    fail('共享方已离线、切换资源库或取消了此用户的授权')
  }
  // 读取设置期间也可能撤销成员。
  if (session.controller.signal.aborted) fail('共享连接已终止')
  session.name = user.name
  return session
}

export async function heartbeatIncoming(
  token: string,
  downloads: DownloadProgress[] = [],
) {
  const session = await validIncoming(token)
  session.lastSeen = Date.now()
  // 只能更新本会话已校验目录并登记的任务，不能通过心跳伪造文件夹记录。
  for (const progress of downloads) {
    const task = session.downloads.find((entry) => entry.id === progress.id)
    if (
      !task ||
      task.total !== progress.total ||
      progress.completed < task.completed ||
      task.state === 'completed' ||
      task.state === 'error'
    )
      continue
    Object.assign(task, progress)
  }
  const permissions = await getEagleFolderSharingSettings()
  return { state: session.state, permissionsRevision: permissions.revision }
}

export function closeIncoming(token: string) {
  const session = incoming.get(token)
  if (session) terminate(session, '请求方已断开共享连接')
}

export async function decideSharing(id: string, approve: boolean) {
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
    await ensureLibraryReady()
    await validIncoming(session.token)
    // 批准的直连才记为登录，心跳不反复刷新上次登录时间。
    await recordMemberLogin(
      session.folderSharingCode,
      {
        id: session.memberId,
        name: session.memberName,
        sessionId: session.id,
      },
      session.address,
    )
    await validIncoming(session.token)
  } catch (error) {
    if (session.state === 'pending')
      terminate(
        session,
        error instanceof Error ? error.message : '共享方资源库加载失败',
      )
    throw error
  }
  if (session.state !== 'pending') fail('该共享请求已被处理或已失效')
  session.state = 'approved'
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

export async function connectRemote(
  config:
    | {
        transport: RoomTransport
        invitationCode: string
      }
    | {
        url: string
        invitationCode: string
        memberName?: string
      },
) {
  const direct = 'url' in config
  const transport = direct ? directTransport(config.url) : config.transport
  const url = normalizeRemoteUrl(transport.url)
  const identity = direct
    ? await saveMemberIdentity(
        config.memberName?.trim() ||
          (await getMemberIdentity())?.name ||
          '共享用户',
      )
    : undefined
  disconnectRemote()
  const session: Outgoing = {
    id: randomUUID(),
    token: '',
    url,
    transport,
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
      transport,
      '/request',
      undefined,
      {
        invitationCode: config.invitationCode,
        instanceId,
        ...(identity ? { member: { ...identity, sessionId: session.id } } : {}),
      },
      session.controller.signal,
      direct ? 8000 : CONNECT_MS,
    )
    if (
      !result.token ||
      !result.id ||
      result.state !== (direct ? 'pending' : 'approved') ||
      result.permissionsRevision === undefined
    )
      fail('目标 LinAI 返回了无效的共享连接响应')
    if (
      outgoing.get(CONNECTION) !== session ||
      session.controller.signal.aborted
    ) {
      void remoteJson(transport, '/session/close', result.token, {}).catch(
        () => undefined,
      )
      fail('共享连接已取消')
    }
    session.token = result.token
    session.permissionsRevision = result.permissionsRevision
    session.state = result.state
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
      .filter(
        (entry) => entry.state === 'pending' || entry.state === 'approved',
      )
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        memberName: entry.roomSecret
          ? findRoomGrant(entry.roomSecret)?.memberName
          : entry.memberName,
        invitationCode: entry.invitationCode,
        state: entry.state,
        ...transferSnapshot(entry),
        downloads: entry.downloads.map((task) => ({
          ...task,
          remaining: task.total - task.completed,
        })),
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

// 后端心跳不依赖浏览器页面；撤销权限、审批超时及租约到期立即终止传输。
const timer = setInterval(() => {
  const now = Date.now()
  for (const [token, session] of incoming) {
    if (
      session.state !== 'closed' &&
      (now - session.lastSeen > LEASE_MS ||
        (session.state === 'pending' && now - session.createdAt > CONNECT_MS))
    )
      terminate(session, '共享连接已超时，请重新连接远程资源库')
    if (session.closedAt && now - session.closedAt > 15000)
      incoming.delete(token)
  }
  for (const session of outgoing.values()) {
    if (
      !session.token ||
      session.checking ||
      !['pending', 'approved'].includes(session.state)
    )
      continue
    session.checking = true
    void remoteJson(
      session.transport,
      '/session/heartbeat',
      session.token,
      {
        downloads: downloadSnapshot()
          .filter((task) => task.connectionId === session.id)
          .map(({ id, completed, total, percent, state, error }) => ({
            id,
            completed,
            total,
            percent,
            state,
            error: error.slice(0, 1000),
          })),
      },
      session.controller.signal,
    )
      .then((result) => {
        if (session.controller.signal.aborted) return
        if (!result.state || result.permissionsRevision === undefined)
          fail('目标 LinAI 返回了无效的共享连接状态')
        session.state = result.state
        session.permissionsRevision = result.permissionsRevision
        if (result.state === 'closed' || result.state === 'error') {
          session.error = '共享连接已终止'
          session.controller.abort()
        }
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
