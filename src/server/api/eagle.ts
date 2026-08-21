import fs from 'fs-extra'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { Readable } from 'node:stream'
import path from 'path'
import sharp from 'sharp'
import type { EagleSortBy, EagleSortOrder } from '@/shared/eagle/types'
import { dataPath } from '../common/storage/data-path'
import {
  getFolderTree,
  getItemEntry,
  getItemFilePath,
  getItemThumbnailPath,
  getItems,
  isVideoExt,
  refreshIndex,
  updateFolder,
} from '../module/eagle/library'

const eagleApi = new Hono()

const THUMB_DIR = dataPath('eagle', 'thumb')
const THUMB_SIZE = 200

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

/** 库内条目内容以 lastModified 为 etag，变更后浏览器缓存自动失效 */
const itemCacheHeaders = (etag: number) => ({
  'Cache-Control': 'private, max-age=0, must-revalidate',
  ETag: `"${etag}"`,
})

const notModified = (c: { req: { header: (n: string) => string | undefined } }, etag: number) =>
  c.req.header('if-none-match') === `"${etag}"`

// 文件夹树（含每文件夹图片数）
eagleApi.get('/folders', async (c) => {
  const folders = await getFolderTree()
  return c.json({ success: true as const, data: folders })
})

// 资源列表：服务端排序 + 分页
eagleApi.get('/items', async (c) => {
  const folderId = c.req.query('folderId') || undefined
  const sortBy = (c.req.query('sortBy') ?? 'mtime') as EagleSortBy
  const sortOrder = (c.req.query('sortOrder') ?? 'desc') as EagleSortOrder
  const offset = Math.max(0, Number(c.req.query('offset')) || 0)
  const limit = Math.min(500, Math.max(1, Number(c.req.query('limit')) || 100))
  const result = await getItems({
    folderId,
    sortBy: sortBy === 'size' ? 'size' : 'mtime',
    sortOrder: sortOrder === 'asc' ? 'asc' : 'desc',
    offset,
    limit,
  })
  return c.json({ success: true as const, data: result })
})

// 手动刷新：触发 mtime.json 增量校验
eagleApi.post('/refresh', async (c) => {
  await refreshIndex()
  return c.json({ success: true as const, data: null })
})

// 编辑文件夹名称/描述（写回库根 metadata.json，模块对库唯一的写操作）
eagleApi.put(
  '/folders/:id',
  zValidator(
    'json',
    z.object({
      name: z.string().trim().min(1),
      description: z.string().max(2000).default(''),
    }),
  ),
  async (c) => {
    const id = c.req.param('id')
    const body = c.req.valid('json')
    const ok = await updateFolder(id, body)
    if (!ok) {
      return c.json({ success: false as const, error: '文件夹不存在' }, 404)
    }
    return c.json({ success: true as const, data: null })
  },
)

// 缩略图：优先库内 _thumbnail.png，缺失时图片用 sharp 生成缓存，视频回退占位 SVG
eagleApi.get('/items/:id/thumbnail', async (c) => {
  const id = c.req.param('id')
  const entry = await getItemEntry(id)
  if (!entry) return c.json({ success: false as const, error: '条目不存在' }, 404)
  if (notModified(c, entry.lastModified)) return c.body(null, 304)

  const libraryThumb = await getItemThumbnailPath(id)
  if (libraryThumb) {
    const file = await fs.readFile(libraryThumb)
    return c.body(new Uint8Array(file), 200, {
      'Content-Type': 'image/png',
      ...itemCacheHeaders(entry.lastModified),
    })
  }

  // 视频无库内缩略图：占位 SVG
  if (isVideoExt(entry.ext)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${THUMB_SIZE}" height="${THUMB_SIZE}" viewBox="0 0 24 24" fill="#94a3b8"><path d="M8 5v14l11-7z"/></svg>`
    return c.body(svg, 200, {
      'Content-Type': 'image/svg+xml',
      ...itemCacheHeaders(entry.lastModified),
    })
  }

  // 图片：sharp 生成 200px webp，缓存到 data/eagle/thumb/（库只读，不写库内）
  const filePath = await getItemFilePath(id)
  if (!filePath) return c.json({ success: false as const, error: '文件不存在' }, 404)
  const thumbPath = path.join(THUMB_DIR, `${id}.webp`)
  try {
    if (!(await fs.pathExists(thumbPath))) {
      await fs.ensureDir(THUMB_DIR)
      await sharp(filePath)
        .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover' })
        .webp({ quality: 80 })
        .toFile(`${thumbPath}.tmp`)
      await fs.move(`${thumbPath}.tmp`, thumbPath, { overwrite: true })
    }
    const file = await fs.readFile(thumbPath)
    return c.body(new Uint8Array(file), 200, {
      'Content-Type': 'image/webp',
      ...itemCacheHeaders(entry.lastModified),
    })
  } catch {
    return c.json({ success: false as const, error: '缩略图生成失败' }, 500)
  }
})

// 原文件：图片整读，视频走 Range 流式（支持进度条拖动）
eagleApi.get('/items/:id/file', async (c) => {
  const id = c.req.param('id')
  const entry = await getItemEntry(id)
  if (!entry) return c.json({ success: false as const, error: '条目不存在' }, 404)
  const filePath = await getItemFilePath(id)
  if (!filePath || !(await fs.pathExists(filePath))) {
    return c.json({ success: false as const, error: '文件不存在' }, 404)
  }
  const contentType = mimeOf(entry.ext)
  const { size } = await fs.stat(filePath)
  const range = c.req.header('range')

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range)
    if (match) {
      const start = match[1] ? parseInt(match[1], 10) : 0
      const end = match[2] ? Math.min(parseInt(match[2], 10), size - 1) : size - 1
      if (start >= size || start > end) {
        return c.body(null, 416, { 'Content-Range': `bytes */${size}` })
      }
      const stream = Readable.toWeb(
        fs.createReadStream(filePath, { start, end }),
      ) as ReadableStream
      return new Response(stream, {
        status: 206,
        headers: {
          'Content-Type': contentType,
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Content-Length': String(end - start + 1),
          'Accept-Ranges': 'bytes',
        },
      })
    }
  }

  const stream = Readable.toWeb(
    fs.createReadStream(filePath),
  ) as ReadableStream
  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(size),
      'Accept-Ranges': 'bytes',
      ...itemCacheHeaders(entry.lastModified),
    },
  })
})

export default eagleApi
