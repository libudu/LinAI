import { resourceLock } from '@/server/common/storage/resource-lock'
import fs from 'fs-extra'
import {
  getItemMediaSource,
  saveVideoThumbnail,
  type EagleItemMediaSource,
} from '../library'
import { THUMB_SIZE } from './cache'
import { extractVideoFrame } from './video'

/** 本地浏览按需补齐封面；同条目串行，共用视频解码锁，不重新下载视频。 */
export const getVideoThumbnail = (source: EagleItemMediaSource) =>
  resourceLock.run(
    `eagle.video-thumbnail:${source.libraryPath}:${source.id}`,
    async () => {
      const current = await getItemMediaSource(source.id)
      if (
        !current ||
        current.libraryPath !== source.libraryPath ||
        current.contentVersion !== source.contentVersion
      )
        throw new Error('资源库或视频已改变，请刷新后重试生成封面')
      if (current.thumbnailPath) {
        try {
          return {
            filePath: current.thumbnailPath,
            buffer: await fs.readFile(current.thumbnailPath),
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
      }
      return resourceLock.run('eagle.video-decoder', async () => {
        const fingerprint = await fs.lstat(current.filePath)
        if (!fingerprint.isFile() || fingerprint.isSymbolicLink())
          throw new Error('视频源文件无效或包含链接')
        // 默认取 1 秒处；短于 1 秒或该位置无法抽帧时回退到首帧。
        const buffer = await extractVideoFrame(
          current.filePath,
          1,
          THUMB_SIZE * 2,
        ).catch(() => extractVideoFrame(current.filePath, 0, THUMB_SIZE * 2))
        const filePath = await saveVideoThumbnail(current, fingerprint, buffer)
        return { filePath, buffer: await fs.readFile(filePath) }
      })
    },
  )
