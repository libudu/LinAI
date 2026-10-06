import { importInputImage } from '@/server/common/static'
import { resourceLock } from '@/server/common/storage/resource-lock'
import fs from 'fs-extra'
import path from 'path'
import sharp from 'sharp'
import type { EagleItemMediaSource } from '../library'
import { getItemMediaSource, isVideoExt } from '../library'
import { THUMB_SIZE, thumbnailCachePath } from './cache'
import { encodeStaticHeif } from './heic'

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  flv: 'video/x-flv',
  m4v: 'video/mp4',
}

const mimeOf = (ext: string) =>
  MIME_BY_EXT[ext.toLowerCase()] ?? 'application/octet-stream'

/** 媒体服务错误只描述业务结果，由路由映射为 HTTP 响应。 */
export class EagleMediaError extends Error {
  constructor(
    readonly status: 404 | 500,
    message: string,
  ) {
    super(message)
  }
}

export const getMediaSource = (
  id: string,
): Promise<EagleItemMediaSource | null> => getItemMediaSource(id)

/** 解析原文件信息；HTTP 条件请求和 Range 处理仍由接口层负责。 */
export const getOriginalFile = async (source: EagleItemMediaSource) => {
  try {
    const stat = await fs.stat(source.filePath)
    if (!stat.isFile()) throw new EagleMediaError(404, '文件不存在')
    return {
      filePath: source.filePath,
      size: stat.size,
      contentType: mimeOf(source.ext),
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      throw new EagleMediaError(404, '文件不存在')
    throw error
  }
}

/** 浏览器不能直接显示 HEIC/HEIF；按需生成全尺寸预览，只读原文件、不写库。 */
export const getPreview = async (source: EagleItemMediaSource) => {
  const original = await getOriginalFile(source)
  if (!['heic', 'heif'].includes(source.ext.toLowerCase())) {
    return {
      content: new Uint8Array(await fs.readFile(original.filePath)),
      contentType: original.contentType,
    }
  }
  try {
    const { webp } = await encodeStaticHeif(
      await fs.readFile(original.filePath),
    )
    return { content: new Uint8Array(webp), contentType: 'image/webp' }
  } catch {
    // 多图、序列或损坏内容无法可靠解码时，仍允许放大已有 Eagle 缩略图。
    return getThumbnail(source)
  }
}

/** 优先库内缩略图，缺失时生成应用缓存；同图请求串行，避免临时文件相互覆盖。 */
export const getThumbnail = async (source: EagleItemMediaSource) => {
  if (source.thumbnailPath) {
    try {
      const file = await fs.readFile(source.thumbnailPath)
      return {
        content: new Uint8Array(file),
        contentType: mimeOf(path.extname(source.thumbnailPath).slice(1)),
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  if (isVideoExt(source.ext)) {
    return {
      content: `<svg xmlns="http://www.w3.org/2000/svg" width="${THUMB_SIZE}" height="${THUMB_SIZE}" viewBox="0 0 24 24" fill="#94a3b8"><path d="M8 5v14l11-7z"/></svg>`,
      contentType: 'image/svg+xml',
    }
  }
  await getOriginalFile(source)
  const thumbPath = thumbnailCachePath(source.id, source.contentVersion)
  try {
    return await resourceLock.run(`eagle.thumbnail:${source.id}`, async () => {
      if (!(await fs.pathExists(thumbPath))) {
        await fs.ensureDir(path.dirname(thumbPath))
        const temporaryPath = `${thumbPath}.tmp`
        try {
          await sharp(source.filePath, { failOn: 'none' })
            .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover' })
            .webp({ quality: 80 })
            .toFile(temporaryPath)
          await fs.move(temporaryPath, thumbPath, { overwrite: true })
        } finally {
          await fs.remove(temporaryPath)
        }
      }
      return {
        content: new Uint8Array(await fs.readFile(thumbPath)),
        contentType: 'image/webp',
      }
    })
  } catch (error) {
    console.error(`[Eagle] 缩略图生成失败：${source.id}`, error)
    throw new EagleMediaError(500, '缩略图生成失败')
  }
}

/** Eagle 到输入图库的导入适配，压缩和去重沿用公共图库规则。 */
export const addItemToGallery = async (id: string) => {
  const source = await getMediaSource(id)
  if (!source || isVideoExt(source.ext))
    throw new EagleMediaError(404, '图片不存在')
  const file = await getOriginalFile(source)
  try {
    return await importInputImage(await fs.readFile(file.filePath))
  } catch (error) {
    console.error('添加 Eagle 图片到图库失败', error)
    throw new EagleMediaError(500, '图片处理失败')
  }
}
