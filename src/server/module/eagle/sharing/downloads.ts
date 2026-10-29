import { changeBus } from '@/server/common/storage/change-bus'
import { resourceLock } from '@/server/common/storage/resource-lock'
import type { EagleMediaType } from '@/shared/eagle/types'
import fs from 'fs-extra'
import { randomUUID } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { runPool } from '../concurrency'
import { EagleError } from '../errors'
import {
  commitDownloadedItem,
  downloadFolderPaths,
  downloadManifestSchema,
  downloadStatusManifestSchema,
  getDownloadedItemIds,
  matchesMediaType,
  type DownloadManifest,
} from '../library'
import { getEagleSettings } from '../settings'
import { downloadSnapshot, downloadTasks as tasks } from './download-state'
import { getRemoteConnection, recordTransfer } from './service'

type Session = Awaited<ReturnType<typeof getRemoteConnection>>
type Summary = { download: number; bytes: number }
const plans = new Map<
  string,
  {
    connection: Session
    libraryPath: string
    folderId: string
    mediaType: EagleMediaType
    folder: string
    manifest: DownloadManifest
    entries: DownloadManifest['items']
    createdAt: number
    permissionsRevision: number | undefined
  }
>()

/** 只清理本次创建的文件和空目录，分别保留错误；短暂占用时有限重试。 */
async function cleanupTemporaryDownload(directory: string) {
  const errors: unknown[] = []
  for (const remove of [
    () => fs.unlink(path.join(directory, 'original')),
    () => fs.rmdir(directory),
  ]) {
    for (let attempt = 0; ; attempt++) {
      try {
        await remove()
        break
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === 'ENOENT') break
        if (
          attempt < 2 &&
          ['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY'].includes(code ?? '')
        ) {
          await delay(50 * (attempt + 1))
          continue
        }
        errors.push(error)
        break
      }
    }
  }
  if (errors.length)
    throw new AggregateError(
      errors,
      errors
        .map((error) =>
          error instanceof Error ? error.message : String(error),
        )
        .join('；'),
    )
}

function assertNoActiveFolderDownload(
  session: Session,
  folderId: string,
  mediaType: EagleMediaType,
) {
  if (
    tasks.some(
      (task) =>
        task.connectionId === session.id &&
        task.folderId === folderId &&
        task.mediaType === mediaType &&
        (task.state === 'queued' || task.state === 'running'),
    )
  )
    throw new EagleError(
      'DUPLICATE_DOWNLOAD_TASK',
      409,
      '此文件夹的同类资源已在下载队列中，请等待当前任务结束',
    )
}

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
        ...(init?.signal ? [init.signal] : []),
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

async function remoteManifest(
  session: Session,
  folderId: string,
  mediaType: EagleMediaType,
) {
  const query = new URLSearchParams({ folderId, mediaType })
  const response = await remoteResponse(session, `/library/manifest?${query}`)
  const json = await response.json()
  if (!json?.success) throw new Error('读取远程资源清单失败')
  const manifest = downloadManifestSchema.parse(json.data)
  // 接收端也按任务类型过滤，避免旧版房主忽略查询参数后下载其他类型。
  manifest.items = manifest.items.filter((item) =>
    matchesMediaType(item.ext, mediaType),
  )
  downloadFolderPaths(manifest.folders)
  if (!manifest.folders.some((entry) => entry.id === folderId))
    throw new EagleError('FOLDER_NOT_FOUND', 404, '文件夹不存在或已取消共享')
  return manifest
}

function missingItems(remote: DownloadManifest, localIds: ReadonlySet<string>) {
  return new Map(
    remote.items
      .filter((item) => !localIds.has(item.id))
      .map((item) => [item.id, item]),
  )
}

async function localItemIds(
  remote: { items: readonly { id: string }[] },
  libraryPath: string | null,
) {
  if (!libraryPath) return new Set<string>()
  return getDownloadedItemIds(
    remote.items.map((item) => item.id),
    libraryPath,
  )
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
  mediaType: EagleMediaType,
) {
  const query = new URLSearchParams({ mediaType })
  const response = await remoteResponse(
    session,
    `/library/manifest/summary?${query}`,
  )
  const json = await response.json()
  if (!json?.success) throw new Error('读取远程资源清单失败')
  const remote = downloadStatusManifestSchema.parse(json.data)
  remote.items = remote.items.filter((item) =>
    matchesMediaType(item.ext, mediaType),
  )
  const localIds = await localItemIds(remote, libraryPath)
  await assertDownloadContext(session, libraryPath, permissionsRevision)
  const parents = new Map(
    remote.folders.map((folder) => [folder.id, folder.parentId]),
  )
  const result: Record<string, Summary> = Object.fromEntries(
    remote.folders.map((folder) => [folder.id, { download: 0, bytes: 0 }]),
  )
  const seen = new Set<string>()
  for (const item of remote.items) {
    if (localIds.has(item.id) || seen.has(item.id)) continue
    seen.add(item.id)
    const affected = new Set<string>()
    for (let folderId of item.folders) {
      while (folderId && !affected.has(folderId)) {
        affected.add(folderId)
        folderId = parents.get(folderId) ?? ''
      }
    }
    for (const id of affected)
      if (result[id]) {
        result[id].download++
        result[id].bytes += item.size
      }
  }
  return { connectionId: session.id, mediaType, folders: result }
}

const statusRequests = new Map<
  string,
  ReturnType<typeof loadFolderDownloadStatuses>
>()
let statusVersion = 0
for (const resource of ['eagle.library', 'settings.eagle'])
  changeBus.subscribe(resource, () => statusVersion++)

export async function getFolderDownloadStatuses(mediaType: EagleMediaType) {
  const session = await getRemoteConnection()
  const libraryPath = (await getEagleSettings()).libraryPath
  const permissionsRevision = session.permissionsRevision
  const key = JSON.stringify([
    session.id,
    libraryPath,
    permissionsRevision,
    mediaType,
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
    mediaType,
  ).finally(() => statusRequests.delete(key))
  statusRequests.set(key, request)
  return request
}

export async function prepareFolderDownload(
  folderId: string,
  mediaType: EagleMediaType,
) {
  const session = await getRemoteConnection()
  assertNoActiveFolderDownload(session, folderId, mediaType)
  const libraryPath = (await getEagleSettings()).libraryPath
  const permissionsRevision = session.permissionsRevision
  if (!libraryPath)
    throw new EagleError(
      'LOCAL_LIBRARY_REQUIRED',
      409,
      '请先配置本地资源库目录',
    )
  const manifest = await remoteManifest(session, folderId, mediaType)
  const local = await localItemIds(manifest, libraryPath)
  const entries = [...missingItems(manifest, local).values()]
  const summary = entries.reduce<Summary>(
    (result, item) => {
      result.download++
      result.bytes += item.size
      return result
    },
    { download: 0, bytes: 0 },
  )
  const now = Date.now()
  for (const [id, plan] of plans)
    if (now - plan.createdAt > 5 * 60 * 1000) plans.delete(id)
  if (plans.size >= 100) throw new Error('待确认任务过多，请稍后重试')
  await assertDownloadContext(session, libraryPath, permissionsRevision)
  assertNoActiveFolderDownload(session, folderId, mediaType)
  const id = randomUUID()
  const paths = downloadFolderPaths(manifest.folders)
  const folder = (JSON.parse(paths.get(folderId)!) as string[]).join(' / ')
  plans.set(id, {
    connection: session,
    libraryPath,
    folderId,
    mediaType,
    folder,
    manifest: { ...manifest, items: [] },
    entries,
    createdAt: now,
    permissionsRevision,
  })
  return { id, folder, mediaType, ...summary }
}

export const startFolderDownload = (id: string) =>
  resourceLock.run('eagle.download-start', async () => {
    const existing = tasks.find((task) => task.id === id)
    if (existing)
      throw new EagleError(
        'DUPLICATE_DOWNLOAD_TASK',
        409,
        '此下载任务已添加，请勿重复提交',
      )
    const plan = plans.get(id)
    if (!plan || Date.now() - plan.createdAt > 5 * 60 * 1000)
      throw new Error('下载清单已过期，请重新打开文件夹')
    const entries = plan.entries
    if (entries.length === 0)
      throw new EagleError('NO_DOWNLOAD_WORK', 400, '没有需要下载的资源')
    const session = await getRemoteConnection()
    if (
      session !== plan.connection ||
      session.permissionsRevision !== plan.permissionsRevision ||
      (await getEagleSettings()).libraryPath !== plan.libraryPath
    )
      throw new Error('连接、权限或本地资源库已改变，请重新检查')
    // 在启动锁内按连接、目录和媒体类型查重，图片与视频可分别排队。
    assertNoActiveFolderDownload(session, plan.folderId, plan.mediaType)
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
      body: JSON.stringify({
        taskId: id,
        folderId: plan.folderId,
        mediaType: plan.mediaType,
        total: entries.length,
      }),
    })
    const json = await response.json()
    if (!json?.success) throw new Error('记录下载日志失败')
    session.controller.signal.throwIfAborted()
    const task: (typeof tasks)[number] = {
      id,
      connectionId: session.id,
      folderId: plan.folderId,
      mediaType: plan.mediaType,
      folder: plan.folder,
      completed: 0,
      currentProgress: new Map(),
      total: entries.length,
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
        // 文件失败只取消本任务，保留共享连接及后续文件夹任务。
        const controller = new AbortController()
        const signal = AbortSignal.any([
          session.controller.signal,
          controller.signal,
        ])
        const cleanupErrors: unknown[] = []
        try {
          const assertContext = async () => {
            signal.throwIfAborted()
            await assertDownloadContext(
              session,
              plan.libraryPath,
              plan.permissionsRevision,
            )
            signal.throwIfAborted()
          }
          await assertContext()
          const fresh = await remoteManifest(
            session,
            plan.folderId,
            plan.mediaType,
          )
          if (
            fresh.libraryId !== plan.manifest.libraryId ||
            JSON.stringify(fresh.folders) !==
              JSON.stringify(plan.manifest.folders)
          )
            throw new Error('远程文件夹已改变，请重新检查')
          const currentItems = new Map(
            fresh.items.map((item) => [item.id, item]),
          )
          const missing = missingItems(
            fresh,
            await localItemIds(fresh, plan.libraryPath),
          )
          const folderPaths = downloadFolderPaths(plan.manifest.folders)
          const validateItem = async (
            item: DownloadManifest['items'][number],
          ) => {
            const response = await remoteResponse(
              session,
              `/library/items/${item.id}/detail`,
              { signal },
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
            signal.throwIfAborted()
            if (session.permissionsRevision !== plan.permissionsRevision)
              throw new Error('共享权限已改变，请重新检查文件夹')
          }
          // 工作槽覆盖下载、等待入库及清理，最多暂存三个文件，避免磁盘积压。
          await runPool(entries, 3, async (item) => {
            let temporary: string | undefined
            try {
              await assertContext()
              // 每项只读取该条目的详情，不重复拉取整个资源库清单。
              const current = currentItems.get(item.id)
              if (!current || JSON.stringify(current) !== JSON.stringify(item))
                throw new Error('远程资源已改变，请重新检查文件夹')
              // 排队期间资源可能已由其他任务下载，不再修改其本地分类。
              if (!missing.has(item.id)) {
                task.completed++
                return
              }
              await validateItem(item)
              temporary = await fs.mkdtemp(
                path.join(os.tmpdir(), 'linai-eagle-download-'),
              )
              signal.throwIfAborted()
              const response = await remoteResponse(
                session,
                `/library/items/${item.id}/file`,
                { signal },
              )
              if (
                !response.body ||
                response.headers.get('etag')?.replaceAll('"', '') !==
                  item.contentVersion
              ) {
                await response.body?.cancel()
                throw new Error('远程资源版本已改变')
              }
              let bytes = 0
              const count = new Transform({
                transform(chunk: Buffer, _encoding, callback) {
                  bytes += chunk.length
                  task.currentProgress.set(
                    item.id,
                    Math.min(0.99, bytes / Math.max(1, item.size)),
                  )
                  recordTransfer(session, chunk.length)
                  if (bytes > item.size)
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
                { signal },
              )
              if (bytes !== item.size) throw new Error('远程文件下载不完整')
              const stagedFile = path.join(temporary, 'original')
              // 校验与提交串行执行；其他工作槽仍可继续下载。
              await resourceLock.run('eagle.download-commit', async () => {
                try {
                  await assertContext()
                  await validateItem(item)
                  await assertContext()
                  await commitDownloadedItem(
                    plan.libraryPath,
                    plan.manifest,
                    item,
                    stagedFile,
                    signal,
                  )
                  task.completed++
                  task.currentProgress.delete(item.id)
                } catch (error) {
                  // 释放提交队列前取消，等待中的文件不能继续入库。
                  controller.abort(error)
                  throw error
                }
              })
            } catch (error) {
              // 清理可能耗时，先中断其他请求和流，保留最先发生的错误。
              controller.abort(error)
              throw error
            } finally {
              if (temporary) {
                try {
                  await cleanupTemporaryDownload(temporary)
                } catch (error) {
                  cleanupErrors.push(error)
                  controller.abort(error)
                  throw error
                }
              }
            }
          })
          signal.throwIfAborted()
          task.state = 'completed'
        } catch (error) {
          // runPool 等待所有工作槽收尾后才抛错，下一文件夹不会与旧任务重叠。
          const reason = signal.aborted ? signal.reason : error
          task.state = 'error'
          task.error = cleanupErrors.includes(reason)
            ? `临时文件清理失败：${reason instanceof Error ? reason.message : String(reason)}`
            : reason instanceof Error
              ? reason.message
              : '下载失败'
          const otherCleanupErrors = cleanupErrors.filter(
            (error) => error !== reason,
          )
          if (otherCleanupErrors.length)
            task.error += `；临时文件清理失败：${otherCleanupErrors
              .map((error) =>
                error instanceof Error ? error.message : String(error),
              )
              .join('；')}`
        } finally {
          // 失败后只保留实际入库或已存在的文件计数。
          task.currentProgress.clear()
        }
      })
      .catch((error) => {
        task.state = 'error'
        task.error = error instanceof Error ? error.message : '下载失败'
      })
    return downloadSnapshot().find((entry) => entry.id === task.id)!
  })
