import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { dataPath } from '../../common/storage/data-path'
import { DocumentStore } from '../../common/storage/document-store'
import { StorageError } from '../../common/storage/errors'

export const memberNameSchema = z.string().trim().min(1).max(80)
const identitySchema = z.object({
  id: z.string().uuid(),
  name: memberNameSchema,
})
export const memberLoginSchema = identitySchema.extend({
  sessionId: z.string().uuid(),
})
export type MemberLogin = z.infer<typeof memberLoginSchema>

export const participantSchema = z.object({
  name: memberNameSchema,
  address: z.string(),
})
export type Participant = z.infer<typeof participantSchema>

const historySchema = z.array(
  identitySchema.extend({
    groupId: z.string().regex(/^[A-Za-z0-9]{8}$/),
    address: z.string(),
    lastLoginAt: z.number().int().nonnegative(),
  }),
)
type Identity = z.infer<typeof identitySchema>
type LoginHistory = z.infer<typeof historySchema>

// 由后端维护，不开放通用写接口；名称和设备标识与权限组授权相互独立。
const identityStore = new DocumentStore<Identity>(
  dataPath('interconnect', 'identity.json'),
)
const historyStore = new DocumentStore<LoginHistory>(
  dataPath('interconnect', 'member-history.json'),
  { maxValueLength: 2 * 1024 * 1024 },
)

export async function getMemberIdentity() {
  const snapshot = await identityStore.get()
  if (snapshot.value === undefined) return null
  const parsed = identitySchema.safeParse(snapshot.value)
  if (!parsed.success)
    throw new StorageError('CORRUPT', '远程互联的用户标识文件格式不正确')
  return parsed.data
}

// 调用方在房间命令队列中执行，避免并发首次加入生成不同的标识。
export async function saveMemberIdentity(name: string): Promise<Identity> {
  const current = await getMemberIdentity()
  const identity = { id: current?.id ?? randomUUID(), name }
  if (current?.name !== name) await identityStore.replace(identity)
  return identity
}

export async function getMemberHistory() {
  const snapshot = await historyStore.get()
  if (snapshot.value === undefined) return []
  const parsed = historySchema.safeParse(snapshot.value)
  if (!parsed.success)
    throw new StorageError('CORRUPT', '远程互联的登录历史文件格式不正确')
  return parsed.data
}

export async function recordMemberLogin(
  groupId: string,
  member: MemberLogin,
  address: string,
) {
  const history = await getMemberHistory()
  const record = {
    groupId,
    id: member.id,
    name: member.name,
    address,
    lastLoginAt: Date.now(),
  }
  const index = history.findIndex(
    (entry) => entry.groupId === groupId && entry.id === member.id,
  )
  if (index < 0) history.push(record)
  else history[index] = record
  await historyStore.replace(history)
}
