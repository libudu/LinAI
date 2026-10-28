import { dataPath } from '@/server/common/storage/data-path'
import { DocumentStore } from '@/server/common/storage/document-store'
import { StorageError } from '@/server/common/storage/errors'
import { resourceLock } from '@/server/common/storage/resource-lock'
import { z } from 'zod'
import { findRoomGrant } from '../../interconnect/access'
import { getFolderTree } from '../library'
import { getEagleFolderSharingSettings } from '../settings'
import { authorizeRead } from './service'

const logSchema = z.array(
  z.object({
    id: z.string().uuid(),
    groupId: z.string(),
    userId: z.string().uuid(),
    folder: z.string(),
    createdAt: z.number(),
  }),
)
const store = new DocumentStore<z.infer<typeof logSchema>>(
  dataPath('interconnect', 'download-history.json'),
  { maxValueLength: 16 * 1024 * 1024 },
)

async function readLogs() {
  const { value } = await store.get()
  if (value === undefined) return []
  const parsed = logSchema.safeParse(value)
  if (!parsed.success)
    throw new StorageError('CORRUPT', '资源下载日志格式不正确')
  return parsed.data
}

export async function getDownloadLogs(groupId: string, userId: string) {
  return (await readLogs())
    .filter((log) => log.groupId === groupId && log.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt)
}

/** 每次用户确认只记录原始目录，重试同一任务不会重复写入。 */
export async function recordDownloadLog(
  token: string,
  folderId: string,
  taskId: string,
) {
  const session = await authorizeRead(token)
  const grant = findRoomGrant(session.roomSecret)
  if (!grant || grant.memberId !== session.memberId)
    throw new Error('请重新连接远程资源库后下载资源')
  const userId = session.memberId
  const readSignal = session.readController.signal
  const settings = await getEagleFolderSharingSettings()
  const library = settings.value.libraries.find(
    (entry) => entry.libraryPath === session.libraryPath,
  )
  const tree = await getFolderTree(undefined, {
    libraryPath: session.libraryPath,
    selectionVersion: library?.selectionVersion ?? 1,
    grantedFolderIds: [
      ...new Set([
        ...(library?.everyone ?? []),
        ...(library?.users[session.folderSharingCode] ?? []),
      ]),
    ],
  })
  const findPath = (
    folders: typeof tree,
    ancestors: string[] = [],
  ): string[] | null => {
    for (const folder of folders) {
      const names = [...ancestors, folder.name]
      if (folder.id === folderId) return names
      const found = findPath(folder.children, names)
      if (found) return found
    }
    return null
  }
  const names = findPath(tree)
  if (!names) throw new Error('文件夹不存在或未共享')
  return resourceLock.run('eagle.download-log', async () => {
    await authorizeRead(token)
    readSignal.throwIfAborted()
    if (findRoomGrant(session.roomSecret)?.memberId !== userId)
      throw new Error('房间用户已改变')
    const logs = await readLogs()
    if (
      logs.some(
        (log) =>
          log.id === taskId &&
          log.groupId === grant.code &&
          log.userId === userId,
      )
    )
      return
    logs.push({
      id: taskId,
      groupId: grant.code,
      userId,
      folder: names.join(' / '),
      createdAt: Date.now(),
    })
    await store.replace(logs)
  })
}
