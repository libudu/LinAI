import { StorageError } from '@/server/common/storage/errors'
import { resourceLock } from '@/server/common/storage/resource-lock'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { createSharingDocumentStore } from './storage'

export const memberNameSchema = z.string().trim().min(1).max(80)
const identitySchema = z.object({
  id: z.string().uuid(),
  name: memberNameSchema,
})
export const memberLoginSchema = identitySchema.extend({
  sessionId: z.string().uuid(),
})
export type MemberLogin = z.infer<typeof memberLoginSchema>

const historySchema = z.array(
  identitySchema.extend({
    groupId: z.string().regex(/^[A-Za-z0-9]{8}$/),
    address: z.string(),
    lastLoginAt: z.number().int().nonnegative(),
  }),
)
type Identity = z.infer<typeof identitySchema>

// 由后端维护，不开放通用写接口；名称和设备标识与权限组授权相互独立。
const identityStore = createSharingDocumentStore(
  'identity.json',
  identitySchema,
)
const historyStore = createSharingDocumentStore(
  'member-history.json',
  historySchema,
  { maxValueLength: 2 * 1024 * 1024 },
)

export async function getMemberIdentity() {
  const snapshot = await identityStore.get()
  if (snapshot.value === undefined) return null
  const parsed = identitySchema.safeParse(snapshot.value)
  if (!parsed.success)
    throw new StorageError('CORRUPT', 'Eagle 共享用户标识文件格式不正确')
  return parsed.data
}

// 在同一资源队列中创建身份或改名。
export async function saveMemberIdentity(name: string): Promise<Identity> {
  return resourceLock.run('eagle.sharing-identity', async () => {
    const current = await getMemberIdentity()
    const identity = {
      id: current?.id ?? randomUUID(),
      name: memberNameSchema.parse(name),
    }
    if (current?.name !== identity.name) await identityStore.replace(identity)
    return identity
  })
}

export async function getMemberHistory() {
  const snapshot = await historyStore.get()
  if (snapshot.value === undefined) return []
  const parsed = historySchema.safeParse(snapshot.value)
  if (!parsed.success)
    throw new StorageError('CORRUPT', 'Eagle 共享登录历史文件格式不正确')
  return parsed.data
}

export async function recordMemberLogin(
  groupId: string,
  member: MemberLogin,
  address: string,
) {
  return resourceLock.run('eagle.sharing-history', async () => {
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
  })
}

// 与登录登记共用资源队列，删除不撤销当前连接。
export async function removeMemberHistory(
  groupId: string | string[],
  userId: string,
) {
  return resourceLock.run('eagle.sharing-history', async () => {
    const groups = new Set(typeof groupId === 'string' ? [groupId] : groupId)
    const history = await getMemberHistory()
    const remaining = history.filter(
      (entry) => !groups.has(entry.groupId) || entry.id !== userId,
    )
    if (remaining.length !== history.length)
      await historyStore.replace(remaining)
  })
}
