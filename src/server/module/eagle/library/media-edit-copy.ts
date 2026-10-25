import { writeJsonFile } from '@/server/common/storage/json-file'
import { randomUUID } from 'node:crypto'
import type { Stats } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { MediaEditProcessingOptions } from '../media/edit'
import { indexCache, libraryChanges } from './index-state'
import { removeMtimes, updateMtimes } from './mtime-state'
import type { withLibraryMutation } from './mutation'
import { toEagleItem } from './query'
import { imagesDir } from './runtime'
import type { EagleIndexState, EagleItemIndex, EagleRawItemMeta } from './types'

type Changes = Parameters<Parameters<typeof withLibraryMutation>[1]>[1]

/** 在隐藏目录准备完整副本，再提交新条目；不移动、重写原条目的任何文件。 */
export const commitMediaEditCopy = async ({
  index,
  changes,
  entry,
  meta,
  output,
  thumbnail,
  width,
  height,
  assertUnchanged,
  signal,
  onProgress,
}: {
  index: EagleIndexState
  changes: Changes
  entry: EagleItemIndex
  meta: EagleRawItemMeta
  output: string
  thumbnail: Buffer
  width: number
  height: number
  assertUnchanged: () => Promise<void>
} & MediaEditProcessingOptions) => {
  const id = randomUUID().replaceAll('-', '').toUpperCase()
  const images = imagesDir(index.libraryPath)
  const staging = path.join(images, `.linai-media-copy-${id}`)
  const destination = path.join(images, `${id}.info`)
  const fileName = `${entry.name}.mp4`
  const thumbnailName = `${entry.name}_thumbnail.png`
  if (
    [fileName, thumbnailName].some(
      (name) =>
        path.basename(name) !== name || /[\\/:*?"<>|\x00-\x1f]/.test(name),
    )
  )
    throw new Error('条目文件名无效，无法另存视频')
  const timestamp = Math.max(changes.timestamp, entry.lastModified + 1)
  const size = (await fs.stat(output)).size
  const nextMeta = {
    ...meta,
    id,
    ext: 'mp4',
    size,
    width,
    height,
    isDeleted: false,
    lastModified: timestamp,
  }
  const nextEntry: EagleItemIndex = {
    id,
    name: entry.name,
    ext: 'mp4',
    size,
    width,
    height,
    mtime: entry.mtime,
    lastModified: timestamp,
    folders: [...entry.folders],
    fileName,
    thumbnailName,
    isDeleted: false,
  }
  await fs.mkdir(staging)
  const identity = await fs.lstat(staging)
  let placed = false
  let committed = false
  let preserve = false
  const files = new Map<string, Stats>()
  try {
    // 同盘移动已转码的临时输出，避免再次复制大视频。
    await fs.rename(output, path.join(staging, fileName))
    files.set(fileName, await fs.lstat(path.join(staging, fileName)))
    await fs.writeFile(path.join(staging, thumbnailName), thumbnail, {
      flag: 'wx',
    })
    files.set(thumbnailName, await fs.lstat(path.join(staging, thumbnailName)))
    await writeJsonFile(path.join(staging, 'metadata.json'), nextMeta, {
      backup: false,
    })
    files.set(
      'metadata.json',
      await fs.lstat(path.join(staging, 'metadata.json')),
    )
    for (const name of files.keys()) {
      const handle = await fs.open(path.join(staging, name), 'r+')
      try {
        await handle.sync()
      } finally {
        await handle.close()
      }
    }
    await assertUnchanged()
    signal?.throwIfAborted()
    onProgress?.({ percent: 99, phase: 'committing', canCancel: false })
    await fs.rename(staging, destination)
    placed = true
    index.items.set(id, nextEntry)
    changes.timestamp = timestamp
    changes.updated.add(id)
    libraryChanges.changed(id)
    await updateMtimes(index.libraryPath, [id], timestamp, true)
    indexCache.markDirty([id])
    await indexCache.flush()
    changes.persisted = true
    committed = true
    return {
      item: toEagleItem(nextEntry, index.libraryPath),
      trashId: null,
      warning: null,
    }
  } catch (error) {
    if (placed) {
      index.items.delete(id)
      changes.updated.delete(id)
      changes.removed.add(id)
      libraryChanges.changed(id)
      try {
        await removeMtimes(index.libraryPath, [id], true)
        indexCache.markDirty([id])
        await indexCache.flush()
        changes.persisted = true
      } catch (rollbackError) {
        preserve = true
        console.error('[Eagle] 裁剪副本索引回滚失败', rollbackError)
        throw new Error(
          '裁剪副本提交失败，副本已保留在库内，请刷新检查；原文件未修改',
        )
      }
    }
    throw error
  } finally {
    if (!committed && !preserve) {
      const directory = placed ? destination : staging
      const current = await fs.lstat(directory)
      if (
        !current.isDirectory() ||
        current.isSymbolicLink() ||
        current.dev !== identity.dev ||
        current.ino !== identity.ino ||
        current.birthtimeMs !== identity.birthtimeMs
      )
        throw new Error('裁剪副本目录已被外部修改，停止清理；原文件未修改')
      for (const [name, original] of files) {
        const file = path.join(directory, name)
        const stat = await fs.lstat(file)
        if (
          !stat.isFile() ||
          stat.isSymbolicLink() ||
          stat.dev !== original.dev ||
          stat.ino !== original.ino ||
          stat.size !== original.size ||
          stat.mtimeMs !== original.mtimeMs
        )
          throw new Error('裁剪副本已被外部修改，停止清理；原文件未修改')
        await fs.unlink(file)
      }
      await fs.rmdir(directory)
    }
  }
}
