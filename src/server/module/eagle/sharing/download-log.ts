import { StorageError } from '@/server/common/storage/errors'
import { resourceLock } from '@/server/common/storage/resource-lock'
import type { EagleMediaType } from '@/shared/eagle/types'
import { z } from 'zod'
import { getFolderTree } from '../library'
import { getEagleFolderSharingSettings } from '../settings'
import { getSharingGroupCodes } from './history'
import { authorizeRead } from './service'
import { createSharingDocumentStore } from './storage'

const logSchema = z.array(
  z.object({
    id: z.string().uuid(),
    groupId: z.string(),
    userId: z.string().uuid(),
    folder: z.string(),
    createdAt: z.number(),
  }),
)
const store = createSharingDocumentStore('download-history.json', logSchema, {
  maxValueLength: 16 * 1024 * 1024,
})

async function readLogs() {
  const { value } = await store.get()
  if (value === undefined) return []
  const parsed = logSchema.safeParse(value)
  if (!parsed.success)
    throw new StorageError('CORRUPT', '资源下载日志格式不正确')
  return parsed.data
}

export async function getDownloadLogs(groupId: string, userId: string) {
  const codes = await getSharingGroupCodes(groupId)
  return (await readLogs())
    .filter((log) => codes.has(log.groupId) && log.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt)
}

/** 每次用户确认只记录原始目录，重试同一任务不会重复写入。 */
export async function recordDownloadLog(
  token: string,
  folderId: string,
  taskId: string,
  total?: number,
  mediaType?: EagleMediaType,
) {
  const session = await authorizeRead(token)
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
    const logs = await readLogs()
    if (
      !logs.some(
        (log) =>
          log.id === taskId &&
          log.groupId === session.folderSharingCode &&
          log.userId === userId,
      )
    ) {
      logs.push({
        id: taskId,
        groupId: session.folderSharingCode,
        userId,
        folder: names.join(' / '),
        createdAt: Date.now(),
      })
      await store.replace(logs)
    }
    if (
      total !== undefined &&
      !session.downloads.some((task) => task.id === taskId)
    ) {
      session.downloads.push({
        id: taskId,
        folder: names.join(' / '),
        mediaType,
        completed: 0,
        total,
        percent: 0,
        state: 'queued',
        error: '',
      })
      while (session.downloads.length > 100) {
        const index = session.downloads.findIndex(
          (task) => task.state === 'completed' || task.state === 'error',
        )
        session.downloads.splice(index < 0 ? 0 : index, 1)
      }
    }
  })
}
