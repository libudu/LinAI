import { changeBus } from '@/server/common/storage/change-bus'
import fs from 'fs-extra'
import { randomUUID } from 'node:crypto'
import type { Stats } from 'node:fs'
import { open } from 'node:fs/promises'
import path from 'node:path'
import { getEagleSettings } from '../settings'
import { indexCache, libraryChanges } from './index-state'
import { readWritableItemMeta, withLibraryMutation } from './mutation'
import { toEagleItem } from './query'
import { EAGLE_LIBRARY_RESOURCE, imagesDir, isVideoExt } from './runtime'
import type { EagleItemMediaSource } from './types'

const regularFile = async (file: string) => {
  const stat = await fs.lstat(file)
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error('视频封面路径包含无效文件或链接')
  return stat
}

/** 抽帧在锁外完成；仅补齐缺失封面，不改视频、元数据或 Eagle 修改指纹。 */
export const saveVideoThumbnail = async (
  source: EagleItemMediaSource,
  fingerprint: Stats,
  buffer: Buffer,
): Promise<string> => {
  const saved = await withLibraryMutation<string | null>(
    null,
    async (index) => {
      const settings = await getEagleSettings()
      const entry = index.items.get(source.id)
      if (
        settings.libraryMode !== 'local' ||
        settings.libraryPath !== source.libraryPath ||
        index.libraryPath !== source.libraryPath ||
        !entry ||
        !isVideoExt(entry.ext) ||
        toEagleItem(entry, index.libraryPath).contentVersion !==
          source.contentVersion
      )
        throw new Error('资源库或视频已改变，请刷新后重试生成封面')
      const directory = path.join(
        imagesDir(index.libraryPath),
        `${source.id}.info`,
      )
      for (const dir of [imagesDir(index.libraryPath), directory]) {
        const stat = await fs.lstat(dir)
        if (!stat.isDirectory() || stat.isSymbolicLink())
          throw new Error('视频目录包含无效路径或链接')
      }
      const realRoot = await fs.realpath(index.libraryPath)
      if (
        path.relative(realRoot, await fs.realpath(directory)).toLowerCase() !==
        path.join('images', `${source.id}.info`).toLowerCase()
      )
        throw new Error('视频目录不在当前资源库内')
      const child = (name: string) => {
        if (
          !name ||
          path.basename(name) !== name ||
          /[\\/:*?"<>|\x00-\x1f]/.test(name)
        )
          throw new Error('视频封面文件名无效')
        return path.join(directory, name)
      }
      await regularFile(child('metadata.json'))
      const metadata = await readWritableItemMeta(index.libraryPath, source.id)
      if (
        !metadata ||
        metadata.name !== entry.name ||
        metadata.ext.toLowerCase() !== entry.ext ||
        (metadata.lastModified ?? 0) !== entry.lastModified
      )
        throw new Error('视频元数据已改变，请刷新后重试生成封面')
      const current = await regularFile(child(entry.fileName))
      if (
        current.dev !== fingerprint.dev ||
        current.ino !== fingerprint.ino ||
        current.size !== fingerprint.size ||
        current.mtimeMs !== fingerprint.mtimeMs ||
        current.ctimeMs !== fingerprint.ctimeMs
      )
        throw new Error('视频在抽帧期间发生变更，请重试')

      // 外部 Eagle 可能已补齐或自定义封面，重新探测并保留它。
      const names = await fs.readdir(directory)
      let thumbnailName = names.find((name) => name.includes('_thumbnail'))
      if (thumbnailName) await regularFile(child(thumbnailName))
      else {
        thumbnailName = `${entry.name}_thumbnail.png`
        const target = child(thumbnailName)
        const temporary = child(`.linai-${randomUUID()}.tmp`)
        try {
          const handle = await open(temporary, 'wx')
          try {
            await handle.writeFile(buffer)
            await handle.sync()
          } finally {
            await handle.close()
          }
          // 原子发布完整图片，目标已出现时拒绝覆盖。
          await fs.link(temporary, target)
        } finally {
          await fs.unlink(temporary).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== 'ENOENT') throw error
          })
        }
      }
      entry.thumbnailName = thumbnailName
      indexCache.markDirty([source.id])
      await indexCache.persist()
      libraryChanges.changed(source.id)
      changeBus.publish({ resource: EAGLE_LIBRARY_RESOURCE })
      return child(thumbnailName)
    },
  )
  if (!saved) throw new Error('资源库当前不可用，无法保存视频封面')
  return saved
}
