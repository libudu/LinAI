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
import { issueRoomGrant, revokeRoomGrant } from './access'
import { command, HOST_IP, startCore, type Core } from './core'
import { openSharingEntry } from './entry'
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
    expiresAt: z.number().int().positive(),
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

type Member = { credentialId: string; ip: string; expiresAt: number }
type Room = {
  id: string
  name: string
  role: 'host' | 'guest'
  peers: string[]
  core: Core
  entry?: Awaited<ReturnType<typeof openSharingEntry>>
  guests: Map<string, Member>
  invitation?: Invitation
  error: string
}
let room: Room | null = null
let queue = Promise.resolve()
let refreshing = false
let routes = new Map<string, ConnectionMode>()
let networkError = ''
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
  current.entry?.server.closeAllConnections?.()
  current.entry?.server.close()
  await current.core.stop()
}

function watchRoom(current: Room) {
  room = current
  current.core.process.once('exit', () => {
    if (room !== current) return
    current.error = 'EasyTier 核心已退出，请关闭房间后重新连接'
    revokeRoomGrant()
    revokeSharing()
    disconnectRemote()
    current.entry?.server.closeAllConnections?.()
    current.entry?.server.close()
    routes = new Map()
  })
}

export const createRoom = (name: string) =>
  mutate(async () => {
    if (room) fail('请先退出当前房间')
    const settings = await getInterconnectSettings()
    const id = randomUUID()
    // 先占用专用共享端口，失败时不启动核心。
    const entry = await openSharingEntry()
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
        peers: settings.value.peers,
        core,
        entry,
        guests: new Map(),
        error: '',
      })
    } catch (error) {
      entry.server.close()
      throw error
    }
  })

export const joinRoom = (text: string) =>
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
    if (invitation.expiresAt <= Date.now())
      fail('此邀请已过期，请向房主索取新邀请')
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
      error: '',
    })
  })

export const leaveRoom = () => mutate(stop)

export async function roomStatus() {
  const users = await getEagleSharingSettings()
  const current = room
  const sharing = sharingSnapshot()
  const connected =
    current?.role === 'guest'
      ? routes.has(HOST_IP)
      : [...(current?.guests.values() ?? [])].some((member) =>
          routes.has(member.ip),
        )
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
          error: current.error || networkError,
          peers: current.peers,
          expiresAt: current.invitation?.expiresAt,
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
        invited: Boolean(member && member.expiresAt > Date.now()),
        online: Boolean(member && routes.has(member.ip)),
        connection: member ? routes.get(member.ip) ?? null : null,
        expiresAt: member?.expiresAt,
        sharing: sharing.incoming.find(
          (entry) => entry.invitationCode === user.invitationCode,
        )?.state,
      }
    }),
    eagle: sharing.outgoing,
  }
}

export const saveMember = (name: string, id?: string) =>
  mutate(async () => {
    const snapshot =
      await settingsRegistry.get<EagleSharingSettings>('eagle-sharing')
    if (id && !snapshot.value.users.some((user) => user.invitationCode === id))
      fail('人员已不存在，请刷新')
    let code: string
    const permissions = await getEagleFolderSharingSettings()
    const reserved = new Set(
      permissions.value.libraries.flatMap((library) =>
        Object.keys(library.users),
      ),
    )
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
  const member = current?.guests.get(id)
  if (member && current) {
    await command(current.core, ['credential', 'revoke', member.credentialId])
    current.guests.delete(id)
  }
}

export const revokeMember = (id: string) =>
  mutate(() => revokeMemberInternal(id))

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

export const inviteMember = (id: string, ttlHours: number) =>
  mutate(async () => {
    const current = room
    if (!current || current.role !== 'host' || current.error)
      fail('请先创建房间')
    const users = await getEagleSharingSettings()
    if (!users.users.some((user) => user.invitationCode === id))
      fail('请先添加该人员')
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
    if (!ip) fail('房间人数已达上限')
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
          String(ttlHours * 3600),
          '--credential-id',
          credentialId,
          '--groups',
          'linai-guest',
          '--reusable',
          'false',
        ]),
      )
    const expiresAt = Date.now() + ttlHours * 3600000
    current.guests.set(id, {
      credentialId: credential.credential_id,
      ip,
      expiresAt,
    })
    const invitation: Invitation = {
      version: 1,
      roomId: current.id,
      name: current.name,
      ip,
      peers: current.peers,
      certificate: current.entry!.certificate,
      credential: credential.credential_secret,
      eagleSecret: issueRoomGrant(id, expiresAt),
      expiresAt,
    }
    return {
      invitation: `linai-room:v1:${Buffer.from(JSON.stringify(invitation)).toString('base64url')}`,
      expiresAt,
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
      !current.core.forwardPort
    )
      fail('请先加入共享方的房间')
    if (current.invitation.expiresAt <= Date.now()) fail('房间凭据已过期')
    const result = await connectRemote({
      url: `https://127.0.0.1:${current.core.forwardPort}`,
      certificate: current.invitation.certificate,
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
  if (current.invitation && current.invitation.expiresAt <= Date.now()) {
    void leaveRoom().catch(() => undefined)
    return
  }
  refreshing = true
  void command<unknown>(current.core, ['peer'])
    .then((result) => {
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
      }
    })
    .catch(() => {
      if (room === current) {
        routes = new Map()
        networkError =
          '尚未取得连接状态；请确认节点可达且支持 Secure Mode 临时凭据'
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
