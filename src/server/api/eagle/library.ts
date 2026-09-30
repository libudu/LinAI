import type { EagleSortBy, EagleSortOrder } from '@/shared/eagle/types'
import { zValidator } from '@hono/zod-validator'
import fs from 'fs-extra'
import { Hono, type Context } from 'hono'
import { Readable } from 'node:stream'
import { z } from 'zod'
import {
  deleteItem,
  getFolderTree,
  getItems,
  getLibraryOverview,
  purgeItem,
  purgeTrash,
  refreshIndex,
  restoreItem,
  trashUnclassified,
  updateFolder,
  updateItem,
} from '../../module/eagle/library'

import {
  addItemToGallery,
  EagleMediaError,
  getMediaSource,
  getOriginalFile,
  getThumbnail,
} from '../../module/eagle/media'

const libraryApi = new Hono()

const mediaErrorResponse = (c: Context, error: unknown) => {
  if (error instanceof EagleMediaError)
    return c.json(
      { success: false as const, error: error.message },
      error.status,
    )
  throw error
}

/** 媒体响应缓存一天，过期后通过 lastModified ETag 条件验证 */
const itemCacheHeaders = (etag: number) => ({
  'Cache-Control': 'private, max-age=86400',
  ETag: `"${etag}"`,
})

const notModified = (
  c: { req: { header: (n: string) => string | undefined } },
  etag: number,
) => c.req.header('if-none-match') === `"${etag}"`

// 目录树与全部/未分类/回收站计数，一次读取返回。
libraryApi.get('/overview', async (c) => {
  const overview = await getLibraryOverview()
  return c.json({ success: true as const, data: overview })
})

// 文件夹树（含每文件夹图片数）
libraryApi.get('/folders', async (c) => {
  const folders = await getFolderTree()
  return c.json({ success: true as const, data: folders })
})

// 资源列表：服务端排序 + 分页
libraryApi.get('/items', async (c) => {
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
libraryApi.post('/refresh', async (c) => {
  await refreshIndex()
  return c.json({ success: true as const, data: null })
})

// 编辑文件夹名称/描述（写回库根 metadata.json，保留其他字段）
libraryApi.put(
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

// 编辑条目（修改所属文件夹 / 标题等）
libraryApi.put(
  '/items/:id',
  zValidator(
    'json',
    z.object({
      folderIds: z.array(z.string()).optional(),
      name: z.string().min(1).optional(),
    }),
  ),
  async (c) => {
    const id = c.req.param('id')
    const body = c.req.valid('json')
    const ok = await updateItem(id, body)
    if (!ok) {
      return c.json({ success: false as const, error: '条目不存在' }, 404)
    }
    return c.json({ success: true as const, data: null })
  },
)

// 移入 Eagle 回收站（软删除）
libraryApi.delete('/items/:id', async (c) => {
  const id = c.req.param('id')
  const ok = await deleteItem(id)
  if (!ok) {
    return c.json({ success: false as const, error: '条目不存在' }, 404)
  }
  return c.json({ success: true as const, data: null })
})

// 从 Eagle 回收站恢复条目
libraryApi.post('/items/:id/restore', async (c) => {
  const id = c.req.param('id')
  const ok = await restoreItem(id)
  if (!ok) {
    return c.json({ success: false as const, error: '条目不存在' }, 404)
  }
  return c.json({ success: true as const, data: null })
})

// 彻底删除单张图片（物理删除磁盘文件）
libraryApi.delete('/items/:id/purge', async (c) => {
  const id = c.req.param('id')
  const ok = await purgeItem(id)
  if (!ok) {
    return c.json({ success: false as const, error: '条目不存在' }, 404)
  }
  return c.json({ success: true as const, data: null })
})

// 全部彻底删除回收站文件（清空回收站）
libraryApi.post('/trash/purge', async (c) => {
  const count = await purgeTrash()
  return c.json({ success: true as const, data: { count } })
})

// 全部移入回收站（未分类目录下所有条目）
libraryApi.post('/unclassified/trash', async (c) => {
  const count = await trashUnclassified()
  return c.json({ success: true as const, data: { count } })
})

// 媒体路由只负责条件请求与响应，缩略图和图库导入由媒体服务处理。
libraryApi.get('/items/:id/thumbnail', async (c) => {
  try {
    const source = await getMediaSource(c.req.param('id'))
    if (!source)
      return c.json({ success: false as const, error: '条目不存在' }, 404)
    if (notModified(c, source.lastModified)) return c.body(null, 304)
    const thumbnail = await getThumbnail(source)
    return c.body(thumbnail.content, 200, {
      'Content-Type': thumbnail.contentType,
      ...itemCacheHeaders(source.lastModified),
    })
  } catch (error) {
    return mediaErrorResponse(c, error)
  }
})

libraryApi.post('/items/:id/add-to-gallery', async (c) => {
  try {
    const result = await addItemToGallery(c.req.param('id'))
    return c.json({ success: true as const, data: result })
  } catch (error) {
    return mediaErrorResponse(c, error)
  }
})

// 原文件统一走流式响应，Range 支持媒体播放器拖动进度。
libraryApi.get('/items/:id/file', async (c) => {
  const source = await getMediaSource(c.req.param('id'))
  if (!source)
    return c.json({ success: false as const, error: '条目不存在' }, 404)
  if (notModified(c, source.lastModified)) return c.body(null, 304)
  let file: Awaited<ReturnType<typeof getOriginalFile>>
  try {
    file = await getOriginalFile(source)
  } catch (error) {
    return mediaErrorResponse(c, error)
  }
  const { filePath, size, contentType } = file
  const range = c.req.header('range')

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range)
    if (match) {
      const start = match[1] ? parseInt(match[1], 10) : 0
      const end = match[2]
        ? Math.min(parseInt(match[2], 10), size - 1)
        : size - 1
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

  const stream = Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream
  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(size),
      'Accept-Ranges': 'bytes',
      ...itemCacheHeaders(source.lastModified),
    },
  })
})

export default libraryApi
