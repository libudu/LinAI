import { changeBus } from '@/server/common/storage/change-bus'
import { resourceLock } from '@/server/common/storage/resource-lock'
import fs from 'fs-extra'
import { randomUUID } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { EagleError } from '../errors'
import {
  commitDownloadedItem,
  createDownloadFolderMapping,
  downloadFolderPaths,
  downloadManifestSchema,
  ensureLibraryReady,
  getDownloadManifest,
  type DownloadManifest,
} from '../library'
import { getEagleSettings } from '../settings'
import { getRemoteConnection, recordTransfer } from './service'

type Session = Awaited<ReturnType<typeof getRemoteConnection>>
type Summary = { download: number; sync: number; bytes: number }
type Task = {
  id: string
  connectionId: string
  folderId: string
  folder: string
  completed: number
  total: number
  state: 'queued' | 'running' | 'completed' | 'error'
  error: string
}
const tasks: Task[] = []
const plans = new Map<
  string,
  {
    connection: Session
    libraryPath: string
    folderId: string
    folder: string
    manifest: DownloadManifest
    entries: { item: DownloadManifest['items'][number]; download: boolean }[]
    createdAt: number
    permissionsRevision: number | undefined
  }
>()

export const downloadSnapshot = () =>
  tasks.map((task) => ({ ...task, remaining: task.total - task.completed }))

async function remoteResponse(
  session: Session,
  endpoint: string,
  init?: RequestInit,
) {
  session.controller.signal.throwIfAborted()
  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${session.token}`)
  const response = await session.transport.fetch(
    `/api/eagle/sharing${endpoint}`,
    {
      ...init,
      redirect: 'error',
      headers,
      signal: AbortSignal.any([
        session.controller.signal,
        AbortSignal.timeout(
          endpoint.endsWith('/file') ? 30 * 60 * 1000 : 30000,
        ),
      ]),
    },
  )
  if (!response.ok) {
    await response.body?.cancel()
    throw new EagleError(
      'REMOTE_DOWNLOAD_FAILED',
      409,
      `远程资源请求失败（${response.status}），请重新检查文件夹`,
    )
  }
  return response
}

async function remoteManifest(session: Session, folderId?: string) {
  const query = folderId === undefined ? '' : `?${new URLSearchParams({ folderId })}`
  const response = await remoteResponse(session, `/library/manifest${query}`)
  const json = await response.json()
  if (!json?.success) throw new Error('读取远程资源清单失败')
  const manifest = downloadManifestSchema.parse(json.data)
  downloadFolderPaths(manifest.folders)
  // 兼容尚未支持 folderId 的共享方，本地也只保留目标范围内的资源。
  return folderId === undefined
    ? manifest
    : { ...manifest, items: scope(manifest, folderId).items }
}

function scope(manifest: DownloadManifest, folderId: string) {
  const folder = manifest.folders.find((entry) => entry.id === folderId)
  if (!folder)
    throw new EagleError('FOLDER_NOT_FOUND', 404, '文件夹不存在或已取消共享')
  const children = new Map<string, string[]>()
  for (const entry of manifest.folders)
    if (entry.parentId) {
      const siblings = children.get(entry.parentId) ?? []
      siblings.push(entry.id)
      children.set(entry.parentId, siblings)
    }
  const ids = new Set<string>()
  const visit = (id: string) => {
    if (ids.has(id)) return
    ids.add(id)
    children.get(id)?.forEach(visit)
  }
  visit(folderId)
  return {
    folder,
    items: manifest.items.filter((item) =>
      item.folders.some((id) => ids.has(id)),
    ),
  }
}

function compare(remote: DownloadManifest, local: DownloadManifest | null) {
  const mapping = createDownloadFolderMapping(remote, local ?? { folders: [] })
  const localItems = new Map(local?.items.map((item) => [item.id, item]))
  const entries = new Map<
    string,
    { item: DownloadManifest['items'][number]; download: boolean }
  >()
  for (const item of remote.items) {
    const existing = localItems.get(item.id)
    if (!existing) entries.set(item.id, { item, download: true })
    else {
      const localFolders = new Set(existing.folders)
      if (
        existing.isDeleted ||
        item.folders.some((id) => {
          const localId = mapping.resolve(id)
          return !localId || !localFolders.has(localId)
        })
      )
        entries.set(item.id, { item, download: false })
    }
  }
  return entries
}

async function localManifest(remote: DownloadManifest, libraryPath: string | null) {
  if (!libraryPath) return null
  await ensureLibraryReady()
  return getDownloadManifest(undefined, {
    itemIds: remote.items.map((item) => item.id),
    libraryPath,
  })
}

async function assertDownloadContext(
  session: Session,
  libraryPath: string | null,
  permissionsRevision: number | undefined,
) {
  if (
    (await getRemoteConnection()) !== session ||
    (await getEagleSettings()).libraryPath !== libraryPath
  )
    throw new Error('连接或本地资源库已改变，请重新检查文件夹')
  session.controller.signal.throwIfAborted()
  if (session.permissionsRevision !== permissionsRevision)
    throw new Error('共享权限已改变，请重新检查文件夹')
}

async function loadFolderDownloadStatuses(
  session: Session,
  libraryPath: string | null,
  permissionsRevision: number | undefined,
) {
  const remote = await remoteManifest(session)
  const local = await localManifest(remote, libraryPath)
  await assertDownloadContext(session, libraryPath, permissionsRevision)
  const entries = compare(remote, local)
  const parents = new Map(
    remote.folders.map((folder) => [folder.id, folder.parentId]),
  )
  const result: Record<string, Summary> = Object.fromEntries(
    remote.folders.map((folder) => [
      folder.id,
      { download: 0, sync: 0, bytes: 0 },
    ]),
  )
  for (const { item, download } of entries.values()) {
    const affected = new Set<string>()
    for (let folderId of item.folders) {
      while (folderId && !affected.has(folderId)) {
        affected.add(folderId)
        folderId = parents.get(folderId) ?? ''
      }
    }
    for (const id of affected)
      if (result[id]) {
        if (download) {
          result[id].download++
          result[id].bytes += item.size
        } else result[id].sync++
      }
  }
  return { connectionId: session.id, folders: result }
}

const statusRequests = new Map<
  string,
  ReturnType<typeof loadFolderDownloadStatuses>
>()
let statusVersion = 0
for (const resource of ['eagle.library', 'settings.eagle'])
  changeBus.subscribe(resource, () => statusVersion++)

export async function getFolderDownloadStatuses() {
  const session = await getRemoteConnection()
  const libraryPath = (await getEagleSettings()).libraryPath
  const permissionsRevision = session.permissionsRevision
  const key = JSON.stringify([
    session.id,
    libraryPath,
    permissionsRevision,
    statusVersion,
    tasks.map((task) => [task.id, task.state]),
  ])
  const existing = statusRequests.get(key)
  if (existing) return existing
  // 只合并同一连接、权限及本地库版本的在途查询，不缓存已完成的结果。
  const request = loadFolderDownloadStatuses(
    session,
    libraryPath,
    permissionsRevision,
  ).finally(() => statusRequests.delete(key))
  statusRequests.set(key, request)
  return request
}

export async function prepareFolderDownload(folderId: string) {
  const session = await getRemoteConnection()
  const libraryPath = (await getEagleSettings()).libraryPath
  const permissionsRevision = session.permissionsRevision
  if (!libraryPath)
    throw new EagleError(
      'LOCAL_LIBRARY_REQUIRED',
      409,
      '请先配置本地资源库目录',
    )
  const manifest = await remoteManifest(session, folderId)
  const local = await localManifest(manifest, libraryPath)
  const selected = scope(manifest, folderId)
  const entries = [...compare(manifest, local).values()]
  const summary = entries.reduce<Summary>(
    (result, entry) => {
      if (entry.download) {
        result.download++
        result.bytes += entry.item.size
      } else result.sync++
      return result
    },
    { download: 0, sync: 0, bytes: 0 },
  )
  const now = Date.now()
  for (const [id, plan] of plans)
    if (now - plan.createdAt > 5 * 60 * 1000) plans.delete(id)
  if (plans.size >= 100) throw new Error('待确认任务过多，请稍后重试')
  await assertDownloadContext(session, libraryPath, permissionsRevision)
  const id = randomUUID()
  const paths = downloadFolderPaths(manifest.folders)
  const folder = (JSON.parse(paths.get(folderId)!) as string[]).join(' / ')
  plans.set(id, {
    connection: session,
    libraryPath,
    folderId,
    folder,
    manifest: { ...manifest, items: [] },
    entries,
    createdAt: now,
    permissionsRevision,
  })
  return { id, folder: selected.folder.name, ...summary }
}

export const startFolderDownload = (id: string) =>
  resourceLock.run('eagle.download-start', async () => {
    const existing = tasks.find((task) => task.id === id)
    if (existing) return { ...existing }
    const plan = plans.get(id)
    if (!plan || Date.now() - plan.createdAt > 5 * 60 * 1000)
      throw new Error('下载清单已过期，请重新打开文件夹')
    if (plan.entries.length === 0) throw new Error('此文件夹已同步完成')
    const session = await getRemoteConnection()
    if (
      session !== plan.connection ||
      session.permissionsRevision !== plan.permissionsRevision ||
      (await getEagleSettings()).libraryPath !== plan.libraryPath
    )
      throw new Error('连接、权限或本地资源库已改变，请重新检查')
    if (
      tasks.some(
        (task) => task.state === 'queued' || task.state === 'running',
      ) &&
      tasks.filter((task) => task.state === 'queued').length >= 50
    )
      throw new Error('下载队列已满')
    const response = await remoteResponse(session, '/session/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: id, folderId: plan.folderId }),
    })
    const json = await response.json()
    if (!json?.success) throw new Error('记录下载日志失败')
    session.controller.signal.throwIfAborted()
    const task: Task = {
      id,
      connectionId: session.id,
      folderId: plan.folderId,
      folder: plan.folder,
      completed: 0,
      total: plan.entries.length,
      state: 'queued',
      error: '',
    }
    tasks.push(task)
    // 任务只在进程内保留；页面刷新不中断，进程退出后重新比较本地资源即可继续。
    while (tasks.length > 100) {
      const index = tasks.findIndex(
        (entry) => entry.state === 'completed' || entry.state === 'error',
      )
      if (index < 0) break
      tasks.splice(index, 1)
    }
    plans.delete(id)
    void resourceLock
      .run('eagle.download-queue', async () => {
        task.state = 'running'
        try {
          const assertContext = () =>
            assertDownloadContext(
              session,
              plan.libraryPath,
              plan.permissionsRevision,
            )
          await assertContext()
          const fresh = await remoteManifest(session, plan.folderId)
          if (
            fresh.libraryId !== plan.manifest.libraryId ||
            JSON.stringify(fresh.folders) !==
            JSON.stringify(plan.manifest.folders)
          )
            throw new Error('远程文件夹已改变，请重新检查')
          const currentItems = new Map(
            fresh.items.map((item) => [item.id, item]),
          )
          const differences = compare(
            fresh,
            await localManifest(fresh, plan.libraryPath),
          )
          const folderPaths = downloadFolderPaths(plan.manifest.folders)
          const validateItem = async (
            item: DownloadManifest['items'][number],
          ) => {
            const response = await remoteResponse(
              session,
              `/library/items/${item.id}/detail`,
            )
            const json = await response.json()
            const detail = json?.data
            const expectedPaths = item.folders
              .map((id) =>
                (JSON.parse(folderPaths.get(id)!) as string[]).join('/'),
              )
              .sort()
            if (
              !json?.success ||
              detail?.contentVersion !== item.contentVersion ||
              detail?.size !== item.size ||
              JSON.stringify(detail.folderPaths?.sort()) !==
                JSON.stringify(expectedPaths)
            )
              throw new Error('远程资源已改变，请重新检查文件夹')
            session.controller.signal.throwIfAborted()
            if (session.permissionsRevision !== plan.permissionsRevision)
              throw new Error('共享权限已改变，请重新检查文件夹')
          }
          for (const entry of plan.entries) {
            await assertContext()
            // 每项只读取该条目的详情，不重复拉取整个资源库清单。
            const current = currentItems.get(entry.item.id)
            if (
              !current ||
              JSON.stringify(current) !== JSON.stringify(entry.item)
            )
              throw new Error('远程资源已改变，请重新检查文件夹')
            const difference = differences.get(entry.item.id)
            if (!difference) {
              task.completed++
              continue
            }
            await validateItem(entry.item)
            let temporary: string | null = null
            try {
              if (difference.download) {
                temporary = await fs.mkdtemp(
                  path.join(os.tmpdir(), 'linai-eagle-download-'),
                )
                const response = await remoteResponse(
                  session,
                  `/library/items/${entry.item.id}/file`,
                )
                if (
                  !response.body ||
                  response.headers.get('etag')?.replaceAll('"', '') !==
                    entry.item.contentVersion
                ) {
                  await response.body?.cancel()
                  throw new Error('远程资源版本已改变')
                }
                let bytes = 0
                const count = new Transform({
                  transform(chunk: Buffer, _encoding, callback) {
                    bytes += chunk.length
                    recordTransfer(session, chunk.length)
                    if (bytes > entry.item.size)
                      callback(new Error('远程文件大小已改变'))
                    else callback(null, chunk)
                  },
                })
                await pipeline(
                  Readable.fromWeb(
                    response.body as import('node:stream/web').ReadableStream,
                  ),
                  count,
                  fs.createWriteStream(path.join(temporary, 'original'), {
                    flags: 'wx',
                  }),
                  { signal: session.controller.signal },
                )
                if (bytes !== entry.item.size)
                  throw new Error('远程文件下载不完整')
              }
              if (difference.download) await validateItem(entry.item)
              await commitDownloadedItem(
                plan.libraryPath,
                plan.manifest,
                entry.item,
                temporary ? path.join(temporary, 'original') : null,
                session.controller.signal,
              )
              task.completed++
            } finally {
              if (temporary) {
                await fs
                  .unlink(path.join(temporary, 'original'))
                  .catch((error: NodeJS.ErrnoException) => {
                    if (error.code !== 'ENOENT') throw error
                  })
                await fs.rmdir(temporary)
              }
            }
          }
          task.state = 'completed'
        } catch (error) {
          task.state = 'error'
          task.error = error instanceof Error ? error.message : '下载失败'
        }
      })
      .catch((error) => {
        task.state = 'error'
        task.error = error instanceof Error ? error.message : '下载失败'
      })
    return { ...task }
  })
