import fs from 'fs-extra'
import { Hono, type Context } from 'hono'
import { Readable } from 'node:stream'
import { z } from 'zod'
import {
  cancelMediaEditSaveJob,
  convertHeifItem,
  deleteItem,
  getConversionCandidates,
  getFolderTree,
  getItemDetail,
  getItems,
  getLibraryOverview,
  getMediaEditSaveJob,
  isVideoExt,
  purgeItem,
  purgeTrash,
  refreshIndex,
  restoreItem,
  saveItemMediaEdits,
  startMediaEditSaveJob,
  trashUnclassified,
  updateFolder,
  updateItem,
} from '../../module/eagle/library'

import {
  addItemToGallery,
  EagleMediaError,
  getMediaSource,
  getOriginalFile,
  getPreview,
  getThumbnail,
} from '../../module/eagle/media'

import { getVideoContactSheet } from '../../module/eagle/media/video'
import {
  eagleItemsQuerySchema,
  eagleMediaEditSaveSchema,
  eagleMediaQuerySchema,
} from '../../module/eagle/schemas'
import { errorResponse, validate } from './validation'

const mediaErrorResponse = (c: Context, error: unknown) => {
  if (error instanceof EagleMediaError)
    return errorResponse(c, error.status, error.message)
  throw error
}

/** 当前内容版本 URL 缓存一天；无版本或旧版本 URL 必须通过 ETag 重新验证。 */
const itemCacheHeaders = (etag: string, version?: string) => ({
  'Cache-Control':
    version === etag ? 'private, max-age=86400' : 'private, no-cache',
  ETag: `"${etag}"`,
})

const notModified = (
  c: { req: { header: (n: string) => string | undefined } },
  etag: string,
) => c.req.header('if-none-match') === `"${etag}"`

const libraryApi = new Hono()
  .get('/items/:id/detail', async (c) => {
    c.header('Cache-Control', 'no-store')
    const data = await getItemDetail(c.req.param('id'))
    if (!data) return errorResponse(c, 404, '条目不存在')
    return c.json({ success: true as const, data })
  })
  .post(
    '/items/:id/media-edits',
    validate('json', eagleMediaEditSaveSchema),
    async (c) => {
      const data = await saveItemMediaEdits(
        c.req.param('id'),
        c.req.valid('json'),
      )
      if (!data) return errorResponse(c, 409, 'Eagle 资源库当前不可用')
      return c.json({ success: true as const, data })
    },
  )
  .post(
    '/items/:id/media-edits/jobs',
    validate('json', eagleMediaEditSaveSchema),
    (c) => {
      return c.json({
        success: true as const,
        data: startMediaEditSaveJob(c.req.param('id'), c.req.valid('json')),
      })
    },
  )
  .get('/items/:id/media-edits/jobs/:jobId', (c) => {
    c.header('Cache-Control', 'no-store')
    return c.json({
      success: true as const,
      data: getMediaEditSaveJob(c.req.param('id'), c.req.param('jobId')),
    })
  })
  .post('/items/:id/media-edits/jobs/:jobId/cancel', (c) =>
    c.json({
      success: true as const,
      data: cancelMediaEditSaveJob(c.req.param('id'), c.req.param('jobId')),
    }),
  )
  .get(
    '/conversion/candidates',
    validate(
      'query',
      z.object({
        offset: z.coerce.number().int().min(0).default(0),
        limit: z.coerce.number().int().min(1).max(100).default(50),
        snapshot: z.enum(['true', 'false']).default('false'),
      }),
    ),
    async (c) => {
      const { offset, limit, snapshot } = c.req.valid('query')
      return c.json({
        success: true as const,
        data: await getConversionCandidates(offset, limit, snapshot === 'true'),
      })
    },
  )
  .post(
    '/conversion/items/:id',
    validate(
      'json',
      z.object({ libraryId: z.string().regex(/^[a-f0-9]{64}$/) }),
    ),
    async (c) => {
      const data = await convertHeifItem(
        c.req.param('id'),
        c.req.valid('json').libraryId,
      )
      if (!data) return errorResponse(c, 409, 'Eagle 资源库当前不可用')
      return c.json({ success: true as const, data })
    },
  )
  // 目录树与全部/未分类/回收站计数，一次读取返回。
  .get('/overview', validate('query', eagleMediaQuerySchema), async (c) => {
    const overview = await getLibraryOverview(c.req.valid('query').mediaType)
    return c.json({ success: true as const, data: overview })
  })

  // 文件夹树（含每文件夹图片数）
  .get('/folders', validate('query', eagleMediaQuerySchema), async (c) => {
    const folders = await getFolderTree(c.req.valid('query').mediaType)
    return c.json({ success: true as const, data: folders })
  })

  // 资源列表：当前文件夹关键词过滤 + 服务端排序与分页
  .get('/items', validate('query', eagleItemsQuerySchema), async (c) => {
    const result = await getItems(c.req.valid('query'))
    return c.json({ success: true as const, data: result })
  })

  // 手动刷新：触发 mtime.json 增量校验
  .post('/refresh', async (c) => {
    await refreshIndex()
    return c.json({ success: true as const, data: null })
  })

  // 编辑文件夹名称/描述（写回库根 metadata.json，保留其他字段）
  .put(
    '/folders/:id',
    validate(
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
        return errorResponse(c, 404, '文件夹不存在')
      }
      return c.json({ success: true as const, data: null })
    },
  )

  // 编辑条目（修改所属文件夹 / 标题等）
  .put(
    '/items/:id',
    validate(
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
        return errorResponse(c, 404, '条目不存在')
      }
      return c.json({ success: true as const, data: null })
    },
  )

  // 移入 Eagle 回收站（软删除）
  .delete('/items/:id', async (c) => {
    const id = c.req.param('id')
    const ok = await deleteItem(id)
    if (!ok) {
      return errorResponse(c, 404, '条目不存在')
    }
    return c.json({ success: true as const, data: null })
  })

  // 从 Eagle 回收站恢复条目
  .post('/items/:id/restore', async (c) => {
    const id = c.req.param('id')
    const ok = await restoreItem(id)
    if (!ok) {
      return errorResponse(c, 404, '条目不存在')
    }
    return c.json({ success: true as const, data: null })
  })

  // 彻底删除单张图片（物理删除磁盘文件）
  .delete('/items/:id/purge', async (c) => {
    const id = c.req.param('id')
    const ok = await purgeItem(id)
    if (!ok) {
      return errorResponse(c, 404, '条目不存在')
    }
    return c.json({ success: true as const, data: null })
  })

  // 全部彻底删除回收站文件（清空回收站）
  .post('/trash/purge', validate('query', eagleMediaQuerySchema), async (c) => {
    const result = await purgeTrash(c.req.valid('query').mediaType)
    return c.json({ success: true as const, data: result })
  })

  // 全部移入回收站（未分类目录下所有条目）
  .post(
    '/unclassified/trash',
    validate('query', eagleMediaQuerySchema),
    async (c) => {
      const count = await trashUnclassified(c.req.valid('query').mediaType)
      return c.json({ success: true as const, data: { count } })
    },
  )

  // 媒体路由只负责条件请求与响应，缩略图和图库导入由媒体服务处理。
  .get('/items/:id/video-contact-sheet', async (c) => {
    const source = await getMediaSource(c.req.param('id'))
    if (!source || !isVideoExt(source.ext))
      return errorResponse(c, 404, '视频不存在')
    try {
      const { buffer } = await getVideoContactSheet(source, c.req.raw.signal)
      return c.body(new Uint8Array(buffer), 200, {
        'Content-Type': 'image/webp',
        'Cache-Control': 'private, no-cache',
      })
    } catch (error) {
      return errorResponse(
        c,
        500,
        error instanceof Error ? error.message : '视频缩略图生成失败',
      )
    }
  })
  .get('/items/:id/preview', async (c) => {
    try {
      const source = await getMediaSource(c.req.param('id'))
      if (!source) return errorResponse(c, 404, '条目不存在')
      if (notModified(c, source.contentVersion)) return c.body(null, 304)
      const preview = await getPreview(source)
      return c.body(preview.content, 200, {
        'Content-Type': preview.contentType,
        ...itemCacheHeaders(source.contentVersion, c.req.query('v')),
      })
    } catch (error) {
      return mediaErrorResponse(c, error)
    }
  })
  .get('/items/:id/thumbnail', async (c) => {
    try {
      const source = await getMediaSource(c.req.param('id'))
      if (!source) return errorResponse(c, 404, '条目不存在')
      if (notModified(c, source.contentVersion)) return c.body(null, 304)
      const thumbnail = await getThumbnail(source)
      return c.body(thumbnail.content, 200, {
        'Content-Type': thumbnail.contentType,
        ...itemCacheHeaders(source.contentVersion, c.req.query('v')),
      })
    } catch (error) {
      return mediaErrorResponse(c, error)
    }
  })

  .post('/items/:id/add-to-gallery', async (c) => {
    try {
      const result = await addItemToGallery(c.req.param('id'))
      return c.json({ success: true as const, data: result })
    } catch (error) {
      return mediaErrorResponse(c, error)
    }
  })

  // 原文件统一走流式响应，Range 支持媒体播放器拖动进度。
  .get('/items/:id/file', async (c) => {
    const source = await getMediaSource(c.req.param('id'))
    if (!source) return errorResponse(c, 404, '条目不存在')
    if (notModified(c, source.contentVersion)) return c.body(null, 304)
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
            ...itemCacheHeaders(source.contentVersion, c.req.query('v')),
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
        ...itemCacheHeaders(source.contentVersion, c.req.query('v')),
      },
    })
  })

export default libraryApi
