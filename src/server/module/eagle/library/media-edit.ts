import { writeJsonFile } from '@/server/common/storage/json-file'
import { resourceLock } from '@/server/common/storage/resource-lock'
import { randomUUID } from 'node:crypto'
import {
  constants,
  createReadStream,
  createWriteStream,
  type Stats,
} from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import sharp from 'sharp'
import { EagleError } from '../errors'
import {
  createEditedMedia,
  editedMediaExtension,
  type MediaEditProcessingOptions,
} from '../media/edit'
import { preserveFileTimestamps } from '../media/timestamps'
import {
  eagleMediaEditSaveSchema,
  type EagleMediaEditSaveRequest,
} from '../schemas'
import { getEagleSettings } from '../settings'
import { ensureIndex, indexCache, libraryChanges } from './index-state'
import { removeMtimes, updateMtimes } from './mtime-state'
import { withLibraryMutation } from './mutation'
import { toEagleItem } from './query'
import { imagesDir, isVideoExt, ITEM_ID_PATTERN } from './runtime'
import type { EagleIndexState, EagleItemIndex, EagleRawItemMeta } from './types'

function conflict(message: string): never {
  throw new EagleError('MEDIA_EDIT_CONFLICT', 409, message)
}

const regularStat = async (file: string) => {
  const stat = await fs.lstat(file)
  if (!stat.isFile() || stat.isSymbolicLink())
    conflict('文件包含链接或不是普通文件')
  return stat
}
const sameFile = (a: Stats, b: Stats) =>
  a.dev === b.dev &&
  a.ino === b.ino &&
  a.size === b.size &&
  a.mtimeMs === b.mtimeMs &&
  a.ctimeMs === b.ctimeMs &&
  a.birthtimeMs === b.birthtimeMs
const sameIdentity = (a: Stats, b: Stats) =>
  a.dev === b.dev && a.ino === b.ino && a.birthtimeMs === b.birthtimeMs
const assertAbsent = async (file: string) => {
  try {
    await fs.lstat(file)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  conflict('目标文件已存在，请刷新后重试')
}

/** 路径只来自绑定的索引；禁止库内链接和文件名越界。 */
const checkedPaths = async (index: EagleIndexState, entry: EagleItemIndex) => {
  const root = path.resolve(index.libraryPath)
  const images = path.join(root, 'images')
  const dir = path.join(images, `${entry.id}.info`)
  for (const directory of [root, images, dir]) {
    const stat = await fs.lstat(directory)
    if (!stat.isDirectory() || stat.isSymbolicLink())
      conflict('资源目录包含链接或不是普通目录')
  }
  if (
    path
      .relative(await fs.realpath(root), await fs.realpath(dir))
      .toLowerCase() !== path.join('images', `${entry.id}.info`).toLowerCase()
  )
    conflict('条目目录不在资源库内')
  const child = (name: string) => {
    if (!name || path.basename(name) !== name || /[\\/:*?"<>|]/.test(name))
      conflict('条目文件名无效')
    return path.join(dir, name)
  }
  return {
    dir,
    source: child(entry.fileName),
    meta: child('metadata.json'),
    thumbnail: child(entry.thumbnailName ?? `${entry.name}_thumbnail.png`),
    target: child(
      editedMediaExtension(entry.ext, isVideoExt(entry.ext)) ===
        entry.ext.toLowerCase()
        ? entry.fileName
        : `${entry.name}.${editedMediaExtension(entry.ext, isVideoExt(entry.ext))}`,
    ),
  }
}
const assertLibrary = async (index: EagleIndexState) => {
  if (
    (await getEagleSettings()).libraryPath !== index.libraryPath ||
    (await ensureIndex()) !== index
  )
    conflict('资源库已切换，请重新打开预览')
}
const syncFile = async (file: string) => {
  const handle = await fs.open(file, 'r+')
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}
const savingItems = new Set<string>()

/** 排队时也可立即取消；队列到达已取消的任务时跳过，不再访问临时目录。 */
const encodeInQueue = <T>(task: () => Promise<T>, signal?: AbortSignal) => {
  signal?.throwIfAborted()
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal?.reason)
    signal?.addEventListener('abort', abort, { once: true })
    void resourceLock
      .run('eagle.media-edit-encoder', async () => {
        signal?.removeEventListener('abort', abort)
        signal?.throwIfAborted()
        return task()
      })
      .then(resolve, reject)
      .finally(() => signal?.removeEventListener('abort', abort))
  })
}

/** 视频备份按字节报告进度，取消会关闭文件流，随后由既有回滚清理备份。 */
const copyBackup = async (
  source: string,
  target: string,
  size: number,
  { signal, onProgress }: MediaEditProcessingOptions,
) => {
  if (!signal) return fs.copyFile(source, target, constants.COPYFILE_EXCL)
  signal.throwIfAborted()
  let copied = 0
  const progress = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      copied += chunk.length
      onProgress?.({
        percent: 95 + Math.min(3, (copied / Math.max(1, size)) * 3),
        phase: 'backup',
        canCancel: true,
      })
      callback(null, chunk)
    },
  })
  try {
    await pipeline(
      createReadStream(source),
      progress,
      createWriteStream(target, { flags: 'wx' }),
      { signal },
    )
  } catch (error) {
    signal.throwIfAborted()
    throw error
  }
}

/** 保存媒体编辑：锁外生成、锁内复核并替换，原始媒体进入 Eagle 回收站。 */
export const saveItemMediaEdits = async (
  id: string,
  request: EagleMediaEditSaveRequest,
  options: MediaEditProcessingOptions = {},
) => {
  const { signal, onProgress } = options
  signal?.throwIfAborted()
  const parsed = eagleMediaEditSaveSchema.safeParse(request)
  if (!ITEM_ID_PATTERN.test(id) || !parsed.success)
    throw new EagleError('INVALID_REQUEST', 400, '媒体编辑保存参数无效')
  const { contentVersion, operations } = parsed.data
  if (savingItems.has(id)) conflict('此条目正在保存编辑，请等待处理完成')
  savingItems.add(id)
  let cleanup: (() => Promise<void>) | undefined
  try {
    const snapshot = await withLibraryMutation(null, async (index) => {
      signal?.throwIfAborted()
      await assertLibrary(index)
      const entry = index.items.get(id)
      if (
        !entry ||
        entry.isDeleted ||
        toEagleItem(entry, index.libraryPath).contentVersion !== contentVersion
      )
        conflict('条目已变化或移入回收站，请重新打开预览')
      const paths = await checkedPaths(index, entry)
      const sourceStat = await regularStat(paths.source)
      await regularStat(paths.meta)
      const metaText = await fs.readFile(paths.meta, 'utf8')
      const meta = JSON.parse(metaText) as EagleRawItemMeta
      if (
        meta.id !== id ||
        meta.name !== entry.name ||
        meta.ext.toLowerCase() !== entry.ext.toLowerCase() ||
        meta.lastModified !== entry.lastModified ||
        meta.isDeleted
      )
        conflict('元数据与索引不一致，请刷新后重试')
      const thumbnailStat = entry.thumbnailName
        ? await regularStat(paths.thumbnail)
        : null
      const thumbnail = thumbnailStat
        ? await fs.readFile(paths.thumbnail)
        : null
      if (
        thumbnailStat &&
        !sameFile(thumbnailStat, await regularStat(paths.thumbnail))
      )
        conflict('缩略图在读取期间变化')
      if (!thumbnail) await assertAbsent(paths.thumbnail)
      return {
        index,
        entry: { ...entry },
        paths,
        sourceStat,
        metaText,
        meta,
        thumbnail,
        thumbnailStat,
      }
    })
    if (!snapshot) conflict('Eagle 资源库当前不可用')
    const {
      index,
      entry,
      paths,
      sourceStat,
      metaText,
      meta,
      thumbnail,
      thumbnailStat,
    } = snapshot
    signal?.throwIfAborted()
    const work = path.join(paths.dir, `.linai-media-edit-${randomUUID()}`)
    await fs.mkdir(work)
    const workStat = await fs.lstat(work)
    const output = path.join(
      work,
      `output.${editedMediaExtension(entry.ext, isVideoExt(entry.ext))}`,
    )
    const thumbOutput = path.join(work, 'thumbnail')
    const recovery = path.join(work, 'recovery')
    cleanup = async () => {
      await checkedPaths(index, entry)
      const stat = await fs.lstat(work)
      if (
        !stat.isDirectory() ||
        stat.isSymbolicLink() ||
        !sameIdentity(workStat, stat)
      )
        conflict('临时目录已被修改，未清理')
      for (const file of [output, thumbOutput, recovery])
        await fs.unlink(file).catch((error) => {
          if (error.code !== 'ENOENT') throw error
        })
      await fs.rmdir(work)
    }
    const result = await encodeInQueue(
      () =>
        createEditedMedia(
          paths.source,
          output,
          entry.ext,
          isVideoExt(entry.ext),
          operations,
          options,
        ),
      signal,
    )
    signal?.throwIfAborted()
    await preserveFileTimestamps(output, sourceStat, signal)
    signal?.throwIfAborted()
    const outputStat = await regularStat(output)
    const thumbnailExt = path.extname(paths.thumbnail).slice(1).toLowerCase()
    const thumbBuffer = await sharp(result.thumbnail)
      .toFormat(
        thumbnailExt === 'jpg'
          ? 'jpeg'
          : (thumbnailExt as keyof sharp.FormatEnum),
      )
      .toBuffer()
    await fs.writeFile(thumbOutput, thumbBuffer, { flag: 'wx' })
    await syncFile(thumbOutput)
    const thumbOutputStat = await regularStat(thumbOutput)
    signal?.throwIfAborted()
    onProgress?.({ percent: 95, phase: 'backup', canCancel: true })
    return await withLibraryMutation(null, async (current, changes) => {
      signal?.throwIfAborted()
      await assertLibrary(index)
      if (
        current !== index ||
        JSON.stringify(current.items.get(id)) !== JSON.stringify(entry)
      )
        conflict('条目在处理期间变化，请刷新后重试')
      await checkedPaths(current, entry)
      const assertUnchanged = async () => {
        await checkedPaths(current, entry)
        await regularStat(paths.meta)
        if (
          !sameFile(sourceStat, await regularStat(paths.source)) ||
          (await fs.readFile(paths.meta, 'utf8')) !== metaText
        )
          conflict('原文件或元数据已变化，未覆盖')
        if (thumbnailStat) {
          if (!sameFile(thumbnailStat, await regularStat(paths.thumbnail)))
            conflict('缩略图已变化，未覆盖')
        } else await assertAbsent(paths.thumbnail)
      }
      await assertUnchanged()
      if (paths.source !== paths.target) await assertAbsent(paths.target)
      if (
        !sameFile(outputStat, await regularStat(output)) ||
        !sameFile(thumbOutputStat, await regularStat(thumbOutput))
      )
        conflict('编辑临时文件已变化，未覆盖')
      const trashId = randomUUID().replaceAll('-', '').toUpperCase()
      const trashDir = path.join(
        imagesDir(current.libraryPath),
        `${trashId}.info`,
      )
      await fs.mkdir(trashDir)
      const trashDirStat = await fs.lstat(trashDir)
      const checkTrashDirectory = async () => {
        await checkedPaths(current, entry)
        const stat = await fs.lstat(trashDir)
        if (
          !stat.isDirectory() ||
          stat.isSymbolicLink() ||
          !sameIdentity(trashDirStat, stat)
        )
          conflict('回收站备份目录已被修改')
      }
      const trashSource = path.join(trashDir, entry.fileName)
      const trashMetaPath = path.join(trashDir, 'metadata.json')
      const trashThumb = entry.thumbnailName
        ? path.join(trashDir, entry.thumbnailName)
        : null
      const timestamp = Math.max(changes.timestamp, entry.lastModified + 1)
      changes.timestamp = timestamp
      const trashMeta = {
        ...meta,
        id: trashId,
        isDeleted: true,
        lastModified: timestamp,
      }
      const nextMeta = {
        ...meta,
        ext: editedMediaExtension(entry.ext, isVideoExt(entry.ext)),
        size: outputStat.size,
        width: result.width,
        height: result.height,
        lastModified: timestamp,
      }
      const nextEntry = {
        ...entry,
        ...nextMeta,
        folders: entry.folders,
        fileName: path.basename(paths.target),
        thumbnailName: path.basename(paths.thumbnail),
      }
      const trashEntry = {
        ...entry,
        id: trashId,
        isDeleted: true,
        lastModified: timestamp,
      }
      let placed = false
      let thumbPlaced = false
      let metadataWritten = false
      let keepTrash = false
      let backupSourceStat: Stats | undefined
      let placedStat: Stats | undefined
      let placedThumbStat: Stats | undefined
      const persist = async () => {
        await updateMtimes(current.libraryPath, [id, trashId], timestamp, true)
        indexCache.markDirty([id, trashId])
        await indexCache.flush()
        changes.persisted = true
      }
      try {
        // 独立复制避免外部编辑原文件时同步改变回收站备份；大视频复制也会显示等待。
        await copyBackup(paths.source, trashSource, sourceStat.size, options)
        signal?.throwIfAborted()
        await syncFile(trashSource)
        await preserveFileTimestamps(trashSource, sourceStat, signal)
        signal?.throwIfAborted()
        backupSourceStat = await regularStat(trashSource)
        if (trashThumb && thumbnail)
          await fs.writeFile(trashThumb, thumbnail, { flag: 'wx' })
        await writeJsonFile(trashMetaPath, trashMeta, { backup: false })
        await assertUnchanged()
        await assertLibrary(index)
        signal?.throwIfAborted()
        // 从此处开始不再接受取消：完成原子提交或按既有流程完整回滚。
        onProgress?.({ percent: 99, phase: 'committing', canCancel: false })
        if (paths.source === paths.target) await fs.rename(output, paths.target)
        else await fs.link(output, paths.target)
        placed = true
        placedStat = await regularStat(paths.target)
        await fs.rename(thumbOutput, paths.thumbnail)
        thumbPlaced = true
        placedThumbStat = await regularStat(paths.thumbnail)
        await regularStat(paths.meta)
        if ((await fs.readFile(paths.meta, 'utf8')) !== metaText)
          conflict('放置新文件后元数据被外部修改，正在回滚')
        await writeJsonFile(paths.meta, nextMeta, { backup: false })
        metadataWritten = true
        current.items.set(id, nextEntry)
        current.items.set(trashId, trashEntry)
        changes.updated.add(id)
        changes.updated.add(trashId)
        libraryChanges.changed(id)
        libraryChanges.changed(trashId)
        await persist()
        keepTrash = true
      } catch (error) {
        // 备份阶段尚未替换任何文件，取消只需清理备份，不触发索引写入或回滚。
        if (!placed && !thumbPlaced && !metadataWritten) throw error
        try {
          await checkedPaths(current, entry)
          if (
            metadataWritten &&
            JSON.stringify(
              JSON.parse(await fs.readFile(paths.meta, 'utf8')),
            ) !== JSON.stringify(nextMeta)
          )
            conflict('元数据被外部修改，保留回收站备份供恢复')
          if (placed) {
            if (
              !placedStat ||
              !sameFile(placedStat, await regularStat(paths.target))
            )
              conflict('输出被外部修改，保留回收站备份供恢复')
            if (paths.source === paths.target) {
              await checkTrashDirectory()
              if (
                !backupSourceStat ||
                !sameFile(backupSourceStat, await regularStat(trashSource))
              )
                conflict('原文件备份已被修改，停止回滚')
              await fs.copyFile(trashSource, recovery, constants.COPYFILE_EXCL)
              await preserveFileTimestamps(recovery, sourceStat)
              await fs.rename(recovery, paths.source)
            } else await fs.unlink(paths.target)
          }
          if (thumbPlaced) {
            if (
              !placedThumbStat ||
              !sameFile(placedThumbStat, await regularStat(paths.thumbnail))
            )
              conflict('缩略图被外部修改，保留回收站备份供恢复')
            if (thumbnail) {
              await fs.writeFile(thumbOutput, thumbnail, { flag: 'wx' })
              await fs.rename(thumbOutput, paths.thumbnail)
            } else await fs.unlink(paths.thumbnail)
          }
          if (metadataWritten)
            await writeJsonFile(paths.meta, meta, { backup: false })
          current.items.set(id, entry)
          changes.timestamp = entry.lastModified
          current.items.delete(trashId)
          changes.updated.delete(trashId)
          changes.removed.add(trashId)
          libraryChanges.changed(id)
          libraryChanges.changed(trashId)
          await updateMtimes(
            current.libraryPath,
            [id],
            entry.lastModified,
            true,
          )
          await removeMtimes(current.libraryPath, [trashId], true)
          indexCache.markDirty([id, trashId])
          await indexCache.flush()
          changes.persisted = true
        } catch (rollbackError) {
          keepTrash = true
          console.error('[Eagle] 媒体编辑保存回滚失败', rollbackError)
          throw new Error(
            '媒体编辑提交失败且未能完整回滚，原文件备份已保留在库内，请刷新检查回收站',
          )
        }
        throw error
      } finally {
        if (!keepTrash) {
          await checkTrashDirectory()
          for (const file of [trashSource, trashMetaPath, trashThumb])
            if (file)
              await fs.unlink(file).catch((error) => {
                if (error.code !== 'ENOENT')
                  console.error('[Eagle] 回滚备份清理失败', error)
              })
          await fs
            .rmdir(trashDir)
            .catch((error) => console.error('[Eagle] 回滚目录清理失败', error))
        }
      }
      let warning: string | null = null
      // 改格式时只删除确切的旧路径，提交之后失败仍有完整回收站备份。
      if (paths.source !== paths.target) {
        try {
          await checkedPaths(current, entry)
          if (!sameFile(sourceStat, await regularStat(paths.source)))
            conflict('旧文件已被外部修改')
          await fs.unlink(paths.source)
        } catch (error) {
          warning = `编辑已保存，但条目目录内的旧文件未清理：${error instanceof Error ? error.message : String(error)}`
        }
      }
      return {
        item: toEagleItem(nextEntry, current.libraryPath),
        trashId,
        warning,
      }
    })
  } finally {
    try {
      await cleanup?.().catch((error) => {
        console.error('[Eagle] 媒体编辑临时文件清理失败', error)
        if (signal?.aborted)
          throw new Error('视频处理已停止，但临时文件清理失败，请检查条目目录')
      })
    } finally {
      savingItems.delete(id)
    }
  }
}
