import { changeBus } from '@/server/common/storage/change-bus'
import { writeJsonFile } from '@/server/common/storage/json-file'
import fs from 'fs-extra'
import { randomUUID } from 'node:crypto'
import type { Stats } from 'node:fs'
import { open } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { runPool } from '../concurrency'
import { EagleError } from '../errors'
import { getEagleSettings } from '../settings'
import { collectFolderPaths } from './folders'
import { ensureIndex, libraryChanges } from './index-state'
import { readWritableItemMeta, withLibraryMutation } from './mutation'
import { toEagleItem } from './query'
import { EAGLE_LIBRARY_RESOURCE, imagesDir, withLibraryLock } from './runtime'
import { projectSharedIndex, type EagleLibraryAccess } from './shared-access'
import type { EagleRawFolder } from './types'

const id = z.string().regex(/^[A-Za-z0-9]+$/)
export const downloadManifestSchema = z.object({
  folders: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string(),
      description: z.string(),
      parentId: z.string().nullable(),
    }),
  ),
  items: z.array(
    z.object({
      id,
      name: z.string().min(1),
      ext: z.string().regex(/^[a-zA-Z0-9]+$/),
      size: z.number().int().nonnegative(),
      width: z.number().nonnegative(),
      height: z.number().nonnegative(),
      mtime: z.number().nonnegative(),
      folders: z.array(z.string()),
      contentVersion: z.string(),
      isDeleted: z.boolean(),
    }),
  ),
})
export type DownloadManifest = z.infer<typeof downloadManifestSchema>
export type DownloadItem = DownloadManifest['items'][number]

export async function getDownloadManifest(
  access?: EagleLibraryAccess,
): Promise<DownloadManifest> {
  const index = await ensureIndex()
  if (!index) throw new EagleError('LIBRARY_UNAVAILABLE', 409, '资源库不可用')
  return withLibraryLock(index.libraryPath, async () => {
    const view = access ? projectSharedIndex(index, access) : index
    const folders: DownloadManifest['folders'] = []
    const visit = (nodes: EagleRawFolder[], parentId: string | null) => {
      for (const folder of nodes) {
        folders.push({
          id: folder.id,
          name: folder.name,
          description: folder.description ?? '',
          parentId,
        })
        visit(folder.children ?? [], folder.id)
      }
    }
    visit(view.folders, null)
    const source = [...view.items.values()]
    const missing = new Set<string>()
    if (!access)
      await runPool(source, 32, async (item) => {
        try {
          await assertPlainPath(
            path.join(imagesDir(index.libraryPath), `${item.id}.info`),
            true,
          )
          await assertPlainPath(
            path.join(
              imagesDir(index.libraryPath),
              `${item.id}.info`,
              item.fileName,
            ),
          )
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT')
            missing.add(item.id)
          else throw error
        }
      })
    const items = source
      .filter((item) => !missing.has(item.id))
      .map((item) => {
        const {
          id,
          name,
          ext,
          size,
          width,
          height,
          mtime,
          folders,
          contentVersion,
        } = toEagleItem(item, view.libraryPath)
        return {
          id,
          name,
          ext,
          size,
          width,
          height,
          mtime,
          folders,
          contentVersion,
          isDeleted: item.isDeleted === true,
        }
      })
    return { folders, items }
  })
}

/** 用目录名数组比较路径，避免不同资源库的目录 ID 不同造成重复下载。 */
export function downloadFolderPaths(folders: DownloadManifest['folders']) {
  const nodes = new Map(folders.map((folder) => [folder.id, folder]))
  const result = new Map<string, string>()
  const resolve = (
    folderId: string,
    visiting = new Set<string>(),
  ): string[] => {
    const folder = nodes.get(folderId)
    if (!folder || visiting.has(folderId)) throw new Error('远程文件夹结构无效')
    visiting.add(folderId)
    return [
      ...(folder.parentId ? resolve(folder.parentId, visiting) : []),
      folder.name,
    ]
  }
  for (const folder of folders)
    result.set(folder.id, JSON.stringify(resolve(folder.id)))
  return result
}

async function assertLocalLibrary(expected: string) {
  if ((await getEagleSettings()).libraryPath !== expected)
    throw new EagleError('LIBRARY_CHANGED', 409, '本地资源库已改变，下载已停止')
  const selected = await fs.realpath(expected)
  if (
    path.resolve(selected).toLowerCase() !==
    path.resolve(expected).toLowerCase()
  )
    throw new Error('本地资源库路径已改变')
  await assertPlainPath(imagesDir(expected), true)
}

async function assertPlainPath(target: string, directory = false) {
  const stat = await fs.lstat(target)
  if (
    stat.isSymbolicLink() ||
    (directory ? !stat.isDirectory() : !stat.isFile())
  )
    throw new Error('资源库中存在无效路径或链接，已停止写入')
  return stat
}

/** 写库只经门面进入；锁内重读磁盘目录，按完整路径复用本地分类。 */
export async function commitDownloadedItem(
  libraryPath: string,
  manifest: DownloadManifest,
  item: DownloadItem,
  stagedFile: string | null,
  signal: AbortSignal,
) {
  await assertLocalLibrary(libraryPath)
  const committed = await withLibraryMutation<boolean>(
    false,
    async (index, changes) => {
      signal.throwIfAborted()
      if (index.libraryPath !== libraryPath) throw new Error('本地资源库已改变')
      await assertLocalLibrary(libraryPath)
      const rootPath = path.join(libraryPath, 'metadata.json')
      await assertPlainPath(rootPath)
      const root = (await fs.readJson(rootPath)) as {
        folders: EagleRawFolder[]
        modificationTime?: number
      }
      let foldersChanged = false
      const remotePaths = downloadFolderPaths(manifest.folders)
      const localPaths = new Map(
        collectFolderPaths(root.folders, 'preorder').map(({ folder }) => [
          folder.id,
          folder,
        ]),
      )
      const nodes = new Map(
        manifest.folders.map((folder) => [folder.id, folder]),
      )
      const mapped = new Map<string, EagleRawFolder>()
      const ensureFolder = (folderId: string): EagleRawFolder => {
        const cached = mapped.get(folderId)
        if (cached) return cached
        const remote = nodes.get(folderId)
        if (!remote) throw new Error('远程文件夹不存在')
        const parent = remote.parentId ? ensureFolder(remote.parentId) : null
        const siblings = parent ? (parent.children ??= []) : root.folders
        let folder = siblings.find((entry) => entry.name === remote.name)
        if (!folder) {
          const id = localPaths.has(remote.id)
            ? randomUUID().replaceAll('-', '')
            : remote.id
          folder = {
            id,
            name: remote.name,
            description: remote.description,
            children: [],
          }
          siblings.push(folder)
          foldersChanged = true
          localPaths.set(id, folder)
        }
        mapped.set(folderId, folder)
        return folder
      }
      const folderIds = item.folders.map((id) => {
        if (!remotePaths.has(id)) throw new Error('远程资源的目录无效')
        return ensureFolder(id).id
      })
      const infoDir = path.join(imagesDir(libraryPath), `${item.id}.info`)
      const existing = index.items.get(item.id)
      if (!stagedFile && !existing)
        throw new Error('本地文件已不存在，请重新下载')
      // 先验证条目路径，再保存任何目录改动。
      if (await fs.pathExists(infoDir)) {
        await assertPlainPath(infoDir, true)
        if (!existing)
          throw new Error('本地存在同 ID 的未识别条目，请刷新资源库后重试')
      }
      const safeName = `${item.name}.${item.ext}`
      if (
        path.basename(safeName) !== safeName ||
        /[\\/:*?"<>|\x00-\x1f]/.test(safeName) ||
        /[. ]$/.test(item.name)
      )
        throw new Error('远程文件名不适用于本地资源库')
      if (stagedFile && (await assertPlainPath(stagedFile)).size !== item.size)
        throw new Error('下载的文件大小不正确')
      if (existing) {
        if (stagedFile) {
          if (
            existing.ext !== item.ext ||
            (await fs.pathExists(path.join(infoDir, existing.fileName)))
          )
            throw new Error('本地条目已改变，请重新检查下载任务')
        } else await assertPlainPath(path.join(infoDir, existing.fileName))
        await assertPlainPath(path.join(infoDir, 'metadata.json'))
      }
      const oldMeta = existing
        ? await readWritableItemMeta(libraryPath, item.id)
        : null
      if (existing && !oldMeta) throw new Error('本地条目元数据已不存在')
      if (foldersChanged) {
        root.modificationTime = changes.timestamp
        await writeJsonFile(rootPath, root, { backup: false })
      }
      index.folders = root.folders
      libraryChanges.reset()
      // 条目提交失败时，已创建的目录也必须通知浏览区刷新。
      if (foldersChanged)
        changeBus.publish({ resource: EAGLE_LIBRARY_RESOURCE })
      const meta = existing
        ? {
            ...oldMeta!,
            ...(stagedFile
              ? {
                  size: item.size,
                  width: item.width,
                  height: item.height,
                  mtime: item.mtime,
                }
              : {}),
            folders: folderIds,
            isDeleted: false,
            lastModified: changes.timestamp,
          }
        : {
            id: item.id,
            name: item.name,
            ext: item.ext,
            size: item.size,
            width: item.width,
            height: item.height,
            mtime: item.mtime,
            folders: folderIds,
            isDeleted: false,
            lastModified: changes.timestamp,
          }
      if (existing) {
        signal.throwIfAborted()
        const originalPath = path.join(infoDir, existing.fileName)
        let copied: Stats | null = null
        try {
          if (stagedFile) {
            await fs.copyFile(
              stagedFile,
              originalPath,
              fs.constants.COPYFILE_EXCL,
            )
            await fs.utimes(
              originalPath,
              new Date(item.mtime),
              new Date(item.mtime),
            )
            copied = await fs.lstat(originalPath)
            const handle = await open(originalPath, 'r+')
            try {
              await handle.sync()
            } finally {
              await handle.close()
            }
          }
          signal.throwIfAborted()
          await writeJsonFile(path.join(infoDir, 'metadata.json'), meta, {
            backup: false,
          })
        } catch (error) {
          if (copied) {
            const current = await assertPlainPath(originalPath)
            if (
              current.ino !== copied.ino ||
              current.size !== copied.size ||
              current.mtimeMs !== copied.mtimeMs
            )
              throw new Error(
                '补下载的文件已被外部修改，已保留文件，请检查本地资源库',
              )
            await fs.unlink(originalPath)
          }
          throw error
        }
        index.items.set(item.id, {
          ...existing,
          size: meta.size,
          width: meta.width ?? 0,
          height: meta.height ?? 0,
          mtime: meta.mtime,
          folders: folderIds,
          isDeleted: false,
          lastModified: changes.timestamp,
        })
      } else {
        // 不覆盖同 ID 条目；隐藏目录完整落盘后一次发布。
        const staging = path.join(
          imagesDir(libraryPath),
          `.linai-download-${randomUUID()}`,
        )
        await fs.mkdir(staging)
        try {
          await fs.copyFile(
            stagedFile!,
            path.join(staging, safeName),
            fs.constants.COPYFILE_EXCL,
          )
          await fs.utimes(
            path.join(staging, safeName),
            new Date(item.mtime),
            new Date(item.mtime),
          )
          await writeJsonFile(path.join(staging, 'metadata.json'), meta, {
            backup: false,
          })
          const handle = await open(path.join(staging, safeName), 'r+')
          try {
            await handle.sync()
          } finally {
            await handle.close()
          }
          signal.throwIfAborted()
          if (await fs.pathExists(infoDir))
            throw new Error('本地条目已出现，停止覆盖')
          await fs.rename(staging, infoDir)
        } finally {
          // 仅清理本次创建的确切文件和空目录，不递归清理库内目录。
          if (await fs.pathExists(staging)) {
            await assertPlainPath(staging, true)
            for (const name of [safeName, 'metadata.json']) {
              const file = path.join(staging, name)
              if (await fs.pathExists(file)) {
                await assertPlainPath(file)
                await fs.unlink(file)
              }
            }
            await fs.rmdir(staging)
          }
        }
        index.items.set(item.id, {
          ...item,
          folders: folderIds,
          fileName: safeName,
          thumbnailName: null,
          isDeleted: false,
          lastModified: changes.timestamp,
        })
      }
      changes.updated.add(item.id)
      libraryChanges.changed(item.id)
      return true
    },
  )
  if (!committed) throw new Error('本地资源库不可用')
}
