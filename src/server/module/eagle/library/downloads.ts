import { changeBus } from '@/server/common/storage/change-bus'
import { writeJsonFile } from '@/server/common/storage/json-file'
import type { EagleMediaType } from '@/shared/eagle/types'
import fs from 'fs-extra'
import { randomUUID } from 'node:crypto'
import type { Stats } from 'node:fs'
import { open } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { runPool } from '../concurrency'
import { EagleError } from '../errors'
import { getEagleSettings } from '../settings'
import {
  createDownloadFolderMapping,
  downloadFolderOrigins,
  downloadFolderSchema,
  getDownloadFolderState,
  manifestFolders,
  rememberDownloadFolders,
} from './download-folders'
import { collectFolderPaths, findRawFolder } from './folders'
import { ensureIndex, ensureLibraryReady, libraryChanges } from './index-state'
import { readWritableItemMeta, withLibraryMutation } from './mutation'
import { toEagleItem } from './query'
import {
  EAGLE_LIBRARY_RESOURCE,
  imagesDir,
  isVideoExt,
  matchesMediaType,
  withLibraryLock,
} from './runtime'
import { projectSharedIndex, type EagleLibraryAccess } from './shared-access'
import type { EagleRawFolder } from './types'

const id = z.string().regex(/^[A-Za-z0-9]+$/)
export const downloadManifestSchema = z.object({
  libraryId: z.string().uuid().optional(),
  folders: z.array(downloadFolderSchema),
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

// 目录状态只需身份、归属和大小，避免传输完整元数据、计算内容哈希及读取目录来源映射。
export const downloadStatusManifestSchema = z.object({
  folders: z.array(downloadFolderSchema.pick({ id: true, parentId: true })),
  items: z.array(
    downloadManifestSchema.shape.items.element.pick({
      id: true,
      ext: true,
      size: true,
      folders: true,
    }),
  ),
})

export async function getDownloadStatusManifest(
  access?: EagleLibraryAccess,
  mediaType?: EagleMediaType,
) {
  const index = await ensureIndex()
  if (!index) throw new EagleError('LIBRARY_UNAVAILABLE', 409, '资源库不可用')
  return withLibraryLock(index.libraryPath, async () => {
    const view = access ? projectSharedIndex(index, access) : index
    const folders: z.infer<typeof downloadStatusManifestSchema>['folders'] = []
    const visit = (nodes: EagleRawFolder[], parentId: string | null) => {
      for (const folder of nodes) {
        folders.push({ id: folder.id, parentId })
        visit(folder.children ?? [], folder.id)
      }
    }
    visit(view.folders, null)
    return {
      folders,
      items: [...view.items.values()]
        .filter((item) => matchesMediaType(item.ext, mediaType))
        .map(({ id, ext, size, folders }) => ({
          id,
          ext,
          size,
          folders: [...folders],
        })),
    }
  })
}

/** 只检查候选 ID 的原文件；回收站中仍存在的原文件同样视为已下载。 */
export async function getDownloadedItemIds(
  itemIds: readonly string[],
  libraryPath: string,
) {
  await ensureLibraryReady()
  const index = await ensureIndex()
  if (!index || index.libraryPath !== libraryPath)
    throw new EagleError('LIBRARY_CHANGED', 409, '本地资源库已改变，请重新检查')
  return withLibraryLock(libraryPath, async () => {
    if ((await getEagleSettings()).libraryPath !== libraryPath)
      throw new EagleError(
        'LIBRARY_CHANGED',
        409,
        '本地资源库已改变，请重新检查',
      )
    const existing = new Set<string>()
    const candidates = [...new Set(itemIds)].flatMap((id) => {
      const item = index.items.get(id)
      return item ? [item] : []
    })
    await runPool(candidates, 32, async (item) => {
      const directory = path.join(imagesDir(libraryPath), `${item.id}.info`)
      try {
        await assertPlainPath(directory, true)
        await assertPlainPath(path.join(directory, item.fileName))
        existing.add(item.id)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    })
    return existing
  })
}

export async function getDownloadManifest(
  access?: EagleLibraryAccess,
  options: {
    folderId?: string
    itemIds?: readonly string[]
    libraryPath?: string
    mediaType?: EagleMediaType
  } = {},
): Promise<DownloadManifest> {
  const index = await ensureIndex()
  if (!index) throw new EagleError('LIBRARY_UNAVAILABLE', 409, '资源库不可用')
  return withLibraryLock(index.libraryPath, async () => {
    if (
      options.libraryPath !== undefined &&
      (index.libraryPath !== options.libraryPath ||
        (await getEagleSettings()).libraryPath !== options.libraryPath)
    )
      throw new EagleError(
        'LIBRARY_CHANGED',
        409,
        '本地资源库已改变，请重新检查',
      )
    const view = access ? projectSharedIndex(index, access) : index
    let folderIds: Set<string> | undefined
    if (options.folderId !== undefined) {
      const folder = findRawFolder(view.folders, options.folderId)
      if (!folder)
        throw new EagleError(
          'FOLDER_NOT_FOUND',
          404,
          '文件夹不存在或已取消共享',
        )
      folderIds = new Set([
        folder.id,
        ...collectFolderPaths(folder.children ?? []).map(
          ({ folder }) => folder.id,
        ),
      ])
    }
    // 保留授权目录树与条目的全部授权归属，跨目录资源仍按完整路径同步分类。
    const folderState = await getDownloadFolderState(index.libraryPath)
    const folders = manifestFolders(view.folders, folderState)
    const candidates = options.itemIds
      ? [...new Set(options.itemIds)].flatMap((id) => {
          const item = view.items.get(id)
          return item ? [item] : []
        })
      : [...view.items.values()]
    const source = candidates.filter(
      (item) =>
        matchesMediaType(item.ext, options.mediaType) &&
        (!folderIds || item.folders.some((id) => folderIds.has(id))),
    )
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
    return { libraryId: folderState.libraryId, folders, items }
  })
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

/** 写库只经门面进入；已有原文件直接跳过，仅为新下载的文件写入目录归属。 */
export async function commitDownloadedItem(
  libraryPath: string,
  manifest: DownloadManifest,
  item: DownloadItem,
  stagedFile: string,
  signal: AbortSignal,
  stagedThumbnail?: string,
) {
  await assertLocalLibrary(libraryPath)
  const committed = await withLibraryMutation<boolean>(
    false,
    async (index, changes) => {
      signal.throwIfAborted()
      if (index.libraryPath !== libraryPath) throw new Error('本地资源库已改变')
      await assertLocalLibrary(libraryPath)
      const infoDir = path.join(imagesDir(libraryPath), `${item.id}.info`)
      const existing = index.items.get(item.id)
      if (
        existing &&
        (await fs.pathExists(path.join(infoDir, existing.fileName)))
      ) {
        // 下载期间条目可能已出现，锁内也必须跳过，不能写回远程分类。
        await assertPlainPath(infoDir, true)
        await assertPlainPath(path.join(infoDir, existing.fileName))
        return true
      }
      const rootPath = path.join(libraryPath, 'metadata.json')
      await assertPlainPath(rootPath)
      const root = (await fs.readJson(rootPath)) as {
        folders: EagleRawFolder[]
        modificationTime?: number
      }
      let foldersChanged = false
      const folderState = await getDownloadFolderState(libraryPath)
      const mapping = createDownloadFolderMapping(manifest, {
        libraryId: folderState.libraryId,
        folders: manifestFolders(root.folders, folderState),
      })
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
        const localId = mapping.resolve(folderId)
        if (localId) {
          const existing = localPaths.get(localId)!
          mapped.set(folderId, existing)
          return existing
        }
        // 只有当前目录未匹配时才处理父目录；不能先按远程层级创建祖先。
        const parent = remote.parentId ? ensureFolder(remote.parentId) : null
        const siblings = parent ? (parent.children ??= []) : root.folders
        const id = localPaths.has(remote.id)
          ? randomUUID().replaceAll('-', '')
          : remote.id
        const folder: EagleRawFolder = {
          id,
          name: remote.name,
          description: remote.description,
          children: [],
        }
        siblings.push(folder)
        foldersChanged = true
        localPaths.set(id, folder)
        mapping.bind(folderId, id)
        mapped.set(folderId, folder)
        return folder
      }
      const importedFolderIds = item.folders.map((id) => ensureFolder(id).id)
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
      if ((await assertPlainPath(stagedFile)).size !== item.size)
        throw new Error('下载的文件大小不正确')
      if (existing) {
        if (
          existing.ext !== item.ext ||
          (await fs.pathExists(path.join(infoDir, existing.fileName)))
        )
          throw new Error('本地条目已改变，请重新检查下载任务')
        await assertPlainPath(path.join(infoDir, 'metadata.json'))
      }
      const oldMeta = existing
        ? await readWritableItemMeta(libraryPath, item.id)
        : null
      if (existing && !oldMeta) throw new Error('本地条目元数据已不存在')
      let thumbnailName = existing?.thumbnailName ?? null
      let writeThumbnail = false
      if (stagedThumbnail) {
        if (!isVideoExt(item.ext)) throw new Error('仅视频下载支持附带封面')
        await assertPlainPath(stagedThumbnail)
        if (
          thumbnailName &&
          (await fs.pathExists(path.join(infoDir, thumbnailName)))
        ) {
          // 补下载时保留本地已有封面，不覆盖外部 Eagle 的修改。
          await assertPlainPath(path.join(infoDir, thumbnailName))
        } else {
          thumbnailName = `${existing?.name ?? item.name}_thumbnail.png`
          if (
            path.basename(thumbnailName) !== thumbnailName ||
            /[\\/:*?"<>|\x00-\x1f]/.test(thumbnailName)
          )
            throw new Error('视频封面文件名不适用于本地资源库')
          if (await fs.pathExists(path.join(infoDir, thumbnailName)))
            throw new Error('本地视频封面已出现，请刷新资源库后重试')
          writeThumbnail = true
        }
      }
      // 以锁内重读的磁盘归属为准，保留远程未共享或本地新增的分类。
      const folderIds = [
        ...new Set([...(oldMeta?.folders ?? []), ...importedFolderIds]),
      ]
      if (foldersChanged) {
        root.modificationTime = changes.timestamp
        await writeJsonFile(rootPath, root, { backup: false })
      }
      index.folders = root.folders
      libraryChanges.reset()
      // 条目提交失败时，已创建的目录也必须通知浏览区刷新。
      if (foldersChanged)
        changeBus.publish({ resource: EAGLE_LIBRARY_RESOURCE })
      await rememberDownloadFolders(
        libraryPath,
        [...mapped].map(([remoteId, folder]) => ({
          localId: folder.id,
          origins: downloadFolderOrigins(manifest, nodes.get(remoteId)!),
        })),
      )
      const meta = existing
        ? {
            ...oldMeta!,
            size: item.size,
            width: item.width,
            height: item.height,
            mtime: item.mtime,
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
        let copiedThumbnail: Stats | null = null
        const thumbnailPath = thumbnailName
          ? path.join(infoDir, thumbnailName)
          : null
        try {
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
          if (writeThumbnail && thumbnailPath) {
            await fs.copyFile(
              stagedThumbnail!,
              thumbnailPath,
              fs.constants.COPYFILE_EXCL,
            )
            copiedThumbnail = await fs.lstat(thumbnailPath)
            const handle = await open(thumbnailPath, 'r+')
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
          const created = [
            { target: originalPath, stat: copied },
            { target: thumbnailPath, stat: copiedThumbnail },
          ].filter(
            (file): file is { target: string; stat: Stats } =>
              file.target !== null && file.stat !== null,
          )
          // 全部校验通过后才回滚，保留已被外部修改的文件。
          for (const { target, stat } of created) {
            const current = await assertPlainPath(target)
            if (
              current.ino !== stat.ino ||
              current.size !== stat.size ||
              current.mtimeMs !== stat.mtimeMs
            )
              throw new Error(
                '补下载的文件已被外部修改，已保留文件，请检查本地资源库',
              )
          }
          for (const { target } of created) await fs.unlink(target)
          throw error
        }
        index.items.set(item.id, {
          ...existing,
          thumbnailName,
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
            stagedFile,
            path.join(staging, safeName),
            fs.constants.COPYFILE_EXCL,
          )
          await fs.utimes(
            path.join(staging, safeName),
            new Date(item.mtime),
            new Date(item.mtime),
          )
          if (writeThumbnail && thumbnailName) {
            const target = path.join(staging, thumbnailName)
            await fs.copyFile(
              stagedThumbnail!,
              target,
              fs.constants.COPYFILE_EXCL,
            )
            const handle = await open(target, 'r+')
            try {
              await handle.sync()
            } finally {
              await handle.close()
            }
          }
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
            for (const name of [
              safeName,
              'metadata.json',
              ...(writeThumbnail && thumbnailName ? [thumbnailName] : []),
            ]) {
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
          thumbnailName,
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
