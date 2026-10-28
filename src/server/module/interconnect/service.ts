import { HTTPException } from 'hono/http-exception'
import { randomBytes, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { settingsRegistry } from '../../common/settings/registry'
import { changeBus } from '../../common/storage/change-bus'
import {
  getEagleFolderSharingSettings,
  getEagleSharingSettings,
  type EagleSettings,
  type EagleSharingSettings,
} from '../eagle/settings'
import {
  connectRemote,
  disconnectRemote,
  revokeSharing,
  sharingSnapshot,
} from '../eagle/sharing/service'
import { findRoomGrant, issueRoomGrant, revokeRoomGrant } from './access'
import { command, HOST_IP, invitationPeers, startCore, type Core } from './core'
import { openSharingEntry } from './entry'
import { createRoomTransport, type RoomTransport } from './https'
import {
  getMemberHistory,
  getMemberIdentity,
  participantSchema,
  recordMemberLogin,
  removeMemberHistory,
  saveMemberIdentity,
  type MemberLogin,
  type Participant,
} from './members'
import { getInterconnectSettings, peerUrlSchema } from './settings'

const inviteSchema = z
  .object({
    version: z.literal(1),
    roomId: z.string().uuid(),
    name: z.string().trim().min(1).max(80),
    ip: z
      .string()
      .regex(/^10\.127\.62\.(?:[2-9]|[1-9]\d|1\d\d|2[0-4]\d|25[0-4])$/),
    credential: z.string().regex(/^[A-Za-z0-9+/]{43}=$/),
    certificate: z.string().max(4096).startsWith('-----BEGIN CERTIFICATE-----'),
    eagleSecret: z.string().regex(/^[a-f0-9]{64}$/),
    // 仅兼容旧邀请；新邀请不再携带有效期。
    expiresAt: z.number().int().positive().optional(),
    peers: z.array(peerUrlSchema).min(1).max(10),
  })
  .strict()
type Invitation = z.infer<typeof inviteSchema>
type ConnectionMode = 'direct' | 'relay' | 'unknown'

// 内置核心的 peer --output json 返回展示行数组，cost 为 p2p / relay(n) / Local。
const peerStatusSchema = z.array(
  z.object({
    ipv4: z.string(),
    cost: z.string().optional(),
  }),
)

// EasyTier 要求正数 TTL，不支持无到期值；统一延长至 9999 年末，保留主动撤销。
const credentialExpiryUnix = 253402300799

type Member = { credentialId: string; ip: string }
type ActiveMember = MemberLogin & {
  address: string
  lastSeen: number
}
type Room = {
  id: string
  name: string
  role: 'host' | 'guest'
  peers: string[]
  core: Core
  entry?: Awaited<ReturnType<typeof openSharingEntry>>
  guests: Map<string, Member>
  invitation?: Invitation
  transport?: RoomTransport
  identity?: MemberLogin
  activeMembers: Map<string, ActiveMember>
  participants: Participant[]
  memberError: string
  hostDisconnectedAt: number | null
  controller: AbortController
  error: string
}
let room: Room | null = null
let queue = Promise.resolve()
let refreshing = false
let routes = new Map<string, ConnectionMode>()
let networkError = ''
const MEMBER_LEASE_MS = 15000
const CONNECTION_GRACE_MS = 30000
function fail(message: string): never {
  throw new HTTPException(409, { message })
}

// 房间命令串行执行，防止双击创建、退出期间发邀请和旧轮次覆盖新房间。
function mutate<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work)
  queue = next.then(
    () => undefined,
    () => undefined,
  )
  return next
}

async function stop() {
  const current = room
  room = null
  routes = new Map()
  networkError = ''
  revokeRoomGrant()
  revokeSharing()
  disconnectRemote()
  if (!current) return
  current.controller.abort()
  current.transport?.close()
  current.entry?.server.closeAllConnections?.()
  current.entry?.server.close()
  await current.core.stop()
}

function watchRoom(current: Room) {
  room = current
  current.core.process.once('close', () => {
    if (room !== current) return
    current.error = current.core.output.message() || 'EasyTier 核心已退出'
    current.controller.abort()
    current.transport?.close()
    current.activeMembers.clear()
    current.participants = []
    revokeRoomGrant()
    revokeSharing()
    disconnectRemote()
    current.entry?.server.closeAllConnections?.()
    current.entry?.server.close()
    routes = new Map()
  })
}

export const createRoom = (name: string, memberName: string) =>
  mutate(async () => {
    if (room) fail('请先退出当前房间')
    const settings = await getInterconnectSettings()
    const identity = await saveMemberIdentity(memberName)
    const id = randomUUID()
    // 先占用专用共享端口，失败时不启动核心。
    const entry = await openSharingEntry({ login: loginMember })
    try {
      const core = await startCore({
        roomId: id,
        peers: settings.value.peers,
        secret: randomBytes(32).toString('hex'),
        ip: HOST_IP,
      })
      watchRoom({
        id,
        name,
        role: 'host',
        identity: { ...identity, sessionId: randomUUID() },
        peers: settings.value.peers,
        core,
        entry,
        guests: new Map(),
        activeMembers: new Map(),
        participants: [],
        memberError: '',
        hostDisconnectedAt: null,
        controller: new AbortController(),
        error: '',
      })
    } catch (error) {
      entry.server.close()
      throw error
    }
  })

export const joinRoom = (text: string, name: string) =>
  mutate(async () => {
    if (room) fail('请先退出当前房间')
    const encoded = text.trim().replace(/^linai-room:v1:/, '')
    if (!/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length > 16000)
      fail('不是有效的 LinAI 房间邀请')
    let invitation: Invitation
    try {
      invitation = inviteSchema.parse(
        JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')),
      )
    } catch {
      fail('房间邀请格式不兼容或内容已损坏')
    }
    if (
      invitation.expiresAt !== undefined &&
      invitation.expiresAt <= Date.now()
    )
      fail('此邀请已过期，请向房主索取新邀请')
    const identity = await saveMemberIdentity(name)
    const core = await startCore({
      roomId: invitation.roomId,
      peers: invitation.peers,
      credential: invitation.credential,
      ip: invitation.ip,
    })
    watchRoom({
      id: invitation.roomId,
      name: invitation.name,
      role: 'guest',
      peers: invitation.peers,
      core,
      guests: new Map(),
      invitation,
      transport: createRoomTransport(
        `https://127.0.0.1:${core.forwardPort}`,
        invitation.certificate,
      ),
      identity: { ...identity, sessionId: randomUUID() },
      activeMembers: new Map(),
      participants: [],
      memberError: '',
      hostDisconnectedAt: Date.now(),
      controller: new AbortController(),
      error: '',
    })
  })

export const leaveRoom = () => mutate(stop)

export async function roomStatus() {
  const [users, history, identity] = await Promise.all([
    getEagleSharingSettings(),
    getMemberHistory(),
    getMemberIdentity(),
  ])
  const current = room
  const sharing = sharingSnapshot()
  const connected =
    current?.role === 'guest'
      ? routes.has(HOST_IP)
      : [...(current?.guests.values() ?? [])].some((member) =>
          routes.has(member.ip),
        )
  const connectionDelayed =
    current?.role === 'guest' &&
    !connected &&
    current.hostDisconnectedAt !== null &&
    Date.now() - current.hostDisconnectedAt >= CONNECTION_GRACE_MS
  return {
    room: current
      ? {
          id: current.id,
          name: current.name,
          role: current.role,
          state: current.error
            ? ('error' as const)
            : connected
              ? ('connected' as const)
              : ('waiting' as const),
          error:
            current.error ||
            networkError ||
            (!connected || current.memberError
              ? current.core.output.message({ includeConnectionRetries: false })
              : '') ||
            (connectionDelayed
              ? '暂未连接到房主，正在自动重试。请确认房主仍在房间中，且双方网络可用。'
              : ''),
          memberError: current.memberError,
          memberName: current.identity?.name,
          participants: (current.role === 'host'
            ? activeParticipants(current)
            : current.participants
          ).map((participant) => ({
            ...participant,
            role:
              participant.address === HOST_IP
                ? ('host' as const)
                : ('guest' as const),
          })),
          peers: current.peers,
          hostOnline: routes.has(HOST_IP),
          connection:
            current.role === 'guest' ? (routes.get(HOST_IP) ?? null) : null,
        }
      : null,
    members: users.users.map((user) => {
      const member = current?.guests.get(user.invitationCode)
      return {
        id: user.invitationCode,
        name: user.name,
        history: history
          .filter((entry) => entry.groupId === user.invitationCode)
          .sort((a, b) => b.lastLoginAt - a.lastLoginAt),
        invited: Boolean(member),
        online: Boolean(member && routes.has(member.ip)),
        connection: member ? (routes.get(member.ip) ?? null) : null,
        sharing: sharing.incoming.find(
          (entry) => entry.invitationCode === user.invitationCode,
        )?.state,
      }
    }),
    eagle: sharing.outgoing,
    memberName: identity?.name ?? '',
  }
}

function activeParticipants(current: Room): Participant[] {
  if (current.error) return []
  return [
    {
      name: current.identity?.name ?? '房主',
      address: HOST_IP,
      connection: null,
    },
    ...[...current.activeMembers.values()]
      .filter(
        (member) =>
          Date.now() - member.lastSeen < MEMBER_LEASE_MS &&
          routes.has(member.address),
      )
      .map((member) => ({
        name: member.name,
        address: member.address,
        connection: routes.get(member.address) ?? null,
      })),
  ]
}

// 成员登记与资源库连接独立；持有邀请能力才可更新该权限组的历史。
const loginMember = (secret: string, identity: MemberLogin) =>
  mutate(async () => {
    const current = room
    const grant = findRoomGrant(secret)
    if (!current || current.role !== 'host' || current.error || !grant)
      fail('房间邀请已撤销，请向房主索取新邀请')
    const member = current.guests.get(grant.code)
    const settings = await getEagleSharingSettings()
    if (
      !member ||
      current.controller.signal.aborted ||
      findRoomGrant(secret) !== grant ||
      !settings.users.some((user) => user.invitationCode === grant.code)
    )
      fail('权限组已不存在或邀请已撤销')
    const previous = current.activeMembers.get(grant.code)
    if (
      !previous ||
      previous.id !== identity.id ||
      previous.sessionId !== identity.sessionId ||
      previous.name !== identity.name ||
      Date.now() - previous.lastSeen >= MEMBER_LEASE_MS
    )
      await recordMemberLogin(grant.code, identity, member.ip)
    if (current.controller.signal.aborted || findRoomGrant(secret) !== grant)
      fail('房间邀请已撤销，请向房主索取新邀请')
    grant.memberName = identity.name
    grant.memberId = identity.id
    current.activeMembers.set(grant.code, {
      ...identity,
      address: member.ip,
      lastSeen: Date.now(),
    })
    return activeParticipants(current)
  })

async function syncMember(current: Room) {
  if (!current.invitation || !current.identity || !current.transport) return
  try {
    const response = await current.transport.fetch(
      '/api/interconnect/member/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${current.invitation.eagleSecret}`,
        },
        body: JSON.stringify(current.identity),
        signal: AbortSignal.any([
          AbortSignal.timeout(6000),
          current.controller.signal,
        ]),
      },
    )
    const result = await response.json()
    if (!response.ok || result?.success !== true)
      throw new Error(result?.error?.message || '房间成员登记失败')
    const participants = z.array(participantSchema).max(254).parse(result.data)
    if (room !== current || current.controller.signal.aborted) return
    current.participants = participants
    current.memberError = ''
  } catch (error) {
    if (room !== current || current.controller.signal.aborted) return
    current.participants = []
    current.memberError =
      error instanceof Error ? error.message : '房间成员登记失败，将自动重试'
  }
}

export const saveMember = (name: string, id?: string) =>
  mutate(async () => {
    const snapshot =
      await settingsRegistry.get<EagleSharingSettings>('eagle-sharing')
    if (id && !snapshot.value.users.some((user) => user.invitationCode === id))
      fail('权限组已不存在，请刷新')
    let code: string
    const permissions = await getEagleFolderSharingSettings()
    const reserved = new Set(
      permissions.value.libraries.flatMap((library) =>
        Object.keys(library.users),
      ),
    )
    for (const entry of await getMemberHistory()) reserved.add(entry.groupId)
    do {
      code = randomBytes(6).toString('hex').slice(0, 8)
    } while (
      reserved.has(code) ||
      snapshot.value.users.some(
        (user) =>
          user.invitationCode === code || user.folderSharingCode === code,
      )
    )
    const users = id
      ? snapshot.value.users.map((user) =>
          user.invitationCode === id
            ? {
                ...user,
                name,
                folderSharingCode:
                  user.folderSharingCode ?? user.invitationCode,
              }
            : user,
        )
      : [
          ...snapshot.value.users,
          { name, invitationCode: code, folderSharingCode: code },
        ]
    await settingsRegistry.put<EagleSharingSettings>(
      'eagle-sharing',
      { users },
      snapshot.revision,
    )
  })

async function revokeMemberInternal(id: string) {
  // 本地资源授权先撤，网络传播失败也绝不恢复旧会话。
  revokeRoomGrant(id)
  revokeSharing(id)
  const current = room
  current?.activeMembers.delete(id)
  const member = current?.guests.get(id)
  if (member && current) {
    await command(current.core, ['credential', 'revoke', member.credentialId])
    current.guests.delete(id)
  }
}

export const revokeMember = (id: string) =>
  mutate(() => revokeMemberInternal(id))

export const deleteMemberHistory = (groupId: string, userId: string) =>
  mutate(() => removeMemberHistory(groupId, userId))

export const deleteMember = (id: string) =>
  mutate(async () => {
    await revokeMemberInternal(id)
    const snapshot =
      await settingsRegistry.get<EagleSharingSettings>('eagle-sharing')
    await settingsRegistry.put(
      'eagle-sharing',
      {
        users: snapshot.value.users.filter(
          (user) => user.invitationCode !== id,
        ),
      },
      snapshot.revision,
    )
  })

export const inviteMember = (id: string) =>
  mutate(async () => {
    const current = room
    if (!current || current.role !== 'host' || current.error)
      fail('请先创建房间')
    const users = await getEagleSharingSettings()
    if (!users.users.some((user) => user.invitationCode === id))
      fail('请先添加该权限组')
    const previous = current.guests.get(id)
    await revokeMemberInternal(id)
    const used = new Set(
      [...current.guests.values()].map((member) => member.ip),
    )
    const ip =
      previous?.ip ??
      Array.from({ length: 253 }, (_, index) => `10.127.62.${index + 2}`).find(
        (ip) => !used.has(ip),
      )
    if (!ip) fail('房间权限组数量已达上限')
    const credentialId = randomUUID()
    const credential = z
      .object({
        credential_id: z.string().uuid(),
        credential_secret: inviteSchema.shape.credential,
      })
      .parse(
        await command(current.core, [
          'credential',
          'generate',
          '--ttl',
          String(credentialExpiryUnix - Math.floor(Date.now() / 1000)),
          '--credential-id',
          credentialId,
          '--groups',
          'linai-guest',
          '--reusable',
          'false',
        ]),
      )
    current.guests.set(id, {
      credentialId: credential.credential_id,
      ip,
    })
    const invitation: Invitation = {
      version: 1,
      roomId: current.id,
      name: current.name,
      ip,
      peers: await invitationPeers(current.core, current.peers),
      certificate: current.entry!.certificate,
      credential: credential.credential_secret,
      eagleSecret: issueRoomGrant(id),
    }
    return {
      invitation: `linai-room:v1:${Buffer.from(JSON.stringify(invitation)).toString('base64url')}`,
    }
  })

export const selectRemoteLibrary = () =>
  mutate(async () => {
    const current = room
    if (
      !current ||
      current.role !== 'guest' ||
      current.error ||
      !current.invitation ||
      !current.transport ||
      !current.core.forwardPort
    )
      fail('请先加入共享方的房间')
    if (
      current.invitation.expiresAt !== undefined &&
      current.invitation.expiresAt <= Date.now()
    )
      fail('房间凭据已过期，请向房主索取新邀请')
    await syncMember(current)
    if (current.memberError) fail(current.memberError)
    const result = await connectRemote({
      transport: current.transport,
      invitationCode: current.invitation.eagleSecret,
    })
    const config = await settingsRegistry.get<EagleSettings>('eagle')
    await settingsRegistry.put(
      'eagle',
      {
        ...config.value,
        libraryMode: 'remote',
        remoteUrl: current.name,
        invitationCode: '',
      },
      config.revision,
    )
    return result
  })

// 后台读取路由用于连接展示；IP/主机名只用来展示状态，不作为 Eagle 身份凭据。
const timer = setInterval(() => {
  const current = room
  if (!current || current.error || refreshing) return
  if (
    current.invitation?.expiresAt !== undefined &&
    current.invitation.expiresAt <= Date.now()
  ) {
    void leaveRoom().catch(() => undefined)
    return
  }
  refreshing = true
  void command<unknown>(current.core, ['peer'])
    .then(async (result) => {
      const data = peerStatusSchema.parse(result)
      const connections = new Map<string, ConnectionMode>()
      for (const entry of data) {
        // 排除本机和公共节点；连上公共节点不代表已经连上房间成员。
        if (
          entry.cost === 'Local' ||
          (!inviteSchema.shape.ip.safeParse(entry.ipv4).success &&
            entry.ipv4 !== HOST_IP)
        )
          continue
        connections.set(
          entry.ipv4,
          entry.cost === 'p2p'
            ? 'direct'
            : /^relay\([1-9]\d*\)$/.test(entry.cost ?? '')
              ? 'relay'
              : 'unknown',
        )
      }
      if (room === current && !current.error) {
        routes = connections
        networkError = ''
        if (current.role === 'guest') {
          if (connections.has(HOST_IP)) {
            current.hostDisconnectedAt = null
            current.core.output.clearConnectionRetries()
            await syncMember(current)
          } else {
            current.hostDisconnectedAt ??= Date.now()
            current.participants = []
            current.memberError = ''
          }
        }
      }
    })
    .catch((error: unknown) => {
      if (room === current) {
        routes = new Map()
        current.participants = []
        current.memberError = ''
        if (current.role === 'guest') current.hostDisconnectedAt ??= Date.now()
        networkError =
          error instanceof Error ? error.message : 'EasyTier RPC unavailable'
      }
    })
    .finally(() => {
      refreshing = false
    })
}, 3000)
timer.unref()

// 库与授权数据仍由 Eagle 持有，不在互联模块复制权限表。
changeBus.subscribe('settings.eagle-sharing', () => {
  void getEagleSharingSettings()
    .then((settings) => {
      for (const id of room?.guests.keys() ?? [])
        if (!settings.users.some((user) => user.invitationCode === id))
          void revokeMember(id).catch(() => undefined)
    })
    .catch(() => {
      revokeRoomGrant()
      revokeSharing()
    })
})

process.once('exit', () => room?.core.process.kill())
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void stop().finally(() => process.exit(0))
  })
