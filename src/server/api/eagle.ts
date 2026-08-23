import type { OrganizeItemStatus } from '@/shared/eagle/organize'
import {
  ORGANIZE_CONCURRENCY_DEFAULT,
  ORGANIZE_CONCURRENCY_MAX,
  ORGANIZE_CONCURRENCY_MIN,
} from '@/shared/eagle/organize'
import type { EagleSortBy, EagleSortOrder } from '@/shared/eagle/types'
import { zValidator } from '@hono/zod-validator'
import fs from 'fs-extra'
import { Hono } from 'hono'
import { Readable } from 'node:stream'
import path from 'path'
import sharp from 'sharp'
import { z } from 'zod'
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
import { organizeService } from '../module/eagle/organize/service'

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
  'Cache-Control': 'private, max-age=86400',
  ETag: `"${etag}"`,
})

const notModified = (
  c: { req: { header: (n: string) => string | undefined } },
  etag: number,
) => c.req.header('if-none-match') === `"${etag}"`

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
  if (!entry)
    return c.json({ success: false as const, error: '条目不存在' }, 404)
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
  if (!filePath)
    return c.json({ success: false as const, error: '文件不存在' }, 404)
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
  if (!entry)
    return c.json({ success: false as const, error: '条目不存在' }, 404)
  if (notModified(c, entry.lastModified)) return c.body(null, 304)
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
      ...itemCacheHeaders(entry.lastModified),
    },
  })
})

// ---------- 图片整理（organize）：任务生命周期与结果读取 ----------

// 步骤 1 准备数据：分类标准列表 + 当前范围内可处理图片数（已排除 gif/视频）
eagleApi.get('/organize/prepare', async (c) => {
  const sortBy: EagleSortBy =
    c.req.query('sortBy') === 'size' ? 'size' : 'mtime'
  const sortOrder: EagleSortOrder =
    c.req.query('sortOrder') === 'asc' ? 'asc' : 'desc'
  const data = await organizeService.prepare({
    folderId: c.req.query('folderId') || undefined,
    sortBy,
    sortOrder,
  })
  return c.json({ success: true as const, data })
})

// 徽标轮询用轻量状态；无任务返回 null
eagleApi.get('/organize/status', async (c) => {
  const data = await organizeService.getStatus()
  return c.json({ success: true as const, data })
})

// 任务详情（含分类标准快照与进度计数）
eagleApi.get('/organize/task', async (c) => {
  const data = await organizeService.getTask()
  return c.json({ success: true as const, data })
})

// 创建任务：固化分类标准快照，把对应数量的图片加入队列
eagleApi.post(
  '/organize/task',
  zValidator(
    'json',
    z.object({
      folderId: z.string().min(1).optional(),
      sortBy: z.enum(['mtime', 'size']),
      sortOrder: z.enum(['asc', 'desc']),
      count: z.number().int().min(1),
      compress: z.boolean(),
      concurrency: z
        .number()
        .int()
        .min(ORGANIZE_CONCURRENCY_MIN)
        .max(ORGANIZE_CONCURRENCY_MAX)
        .default(ORGANIZE_CONCURRENCY_DEFAULT),
    }),
  ),
  async (c) => {
    const body = c.req.valid('json')
    const result = await organizeService.createTask(body)
    if (!result.ok) {
      return c.json(
        { success: false as const, error: result.error },
        result.status,
      )
    }
    return c.json({ success: true as const, data: result.task })
  },
)

// 追加图片：向当前锁定文件夹的任务追加图片到队尾
eagleApi.post(
  '/organize/task/append',
  zValidator(
    'json',
    z.object({
      count: z.number().int().min(1),
    }),
  ),
  async (c) => {
    const body = c.req.valid('json')
    const result = await organizeService.appendItems(body.count)
    if (!result.ok) {
      return c.json(
        { success: false as const, error: result.error },
        result.status,
      )
    }
    return c.json({ success: true as const, data: null })
  },
)

// 获取失败条目列表（步骤 2 专用）
eagleApi.get('/organize/failed-items', async (c) => {
  const data = await organizeService.listFailedItems()
  return c.json({ success: true as const, data })
})

// 批量跳过所有失败项
eagleApi.post('/organize/task/skip-failed', async (c) => {
  const result = await organizeService.skipFailedItems()
  if (!result.ok) {
    return c.json(
      { success: false as const, error: result.error },
      result.status,
    )
  }
  return c.json({ success: true as const, data: null })
})

// 用户暂停：停止派发新请求，正在发送的请求不受影响
eagleApi.post('/organize/task/pause', async (c) => {
  const ok = await organizeService.pauseTask()
  if (!ok) {
    return c.json({ success: false as const, error: '任务当前不在执行中' }, 409)
  }
  return c.json({ success: true as const, data: null })
})

eagleApi.post('/organize/task/resume', async (c) => {
  const ok = await organizeService.resumeTask()
  if (!ok) {
    return c.json(
      { success: false as const, error: '任务当前不在暂停状态' },
      409,
    )
  }
  return c.json({ success: true as const, data: null })
})

// 暂停后批量重试失败项：移到队首并恢复执行
eagleApi.post('/organize/task/retry-failed', async (c) => {
  const result = await organizeService.retryFailedItems()
  if (!result.ok) {
    return c.json(
      { success: false as const, error: result.error },
      result.status,
    )
  }
  return c.json({ success: true as const, data: null })
})

// 暂停后直接分类：过滤未处理与失败项，仅用成功结果进入确认步骤
eagleApi.post('/organize/task/classify-successful', async (c) => {
  const result = await organizeService.classifySuccessfulItems()
  if (!result.ok) {
    return c.json(
      { success: false as const, error: result.error },
      result.status,
    )
  }
  return c.json({ success: true as const, data: null })
})

// 强制清空任务：中断 in-flight 请求，丢弃任务与全部结果，回到第一步
eagleApi.post('/organize/task/clear', async (c) => {
  await organizeService.clearTask()
  return c.json({ success: true as const, data: null })
})

// 执行中步骤的队列预览：执行中/待处理/失败条目（失败附原因），完成无误的项不返回；
// limit 缺省 20（上限 50），返回 total 用于「仅展示前 N 条」提示
eagleApi.get('/organize/queue', async (c) => {
  const limit = Math.min(50, Math.max(1, Number(c.req.query('limit')) || 20))
  const data = await organizeService.getQueue(limit)
  return c.json({ success: true as const, data })
})

// 结果列表（可按状态过滤，如 status=success / failed 表示待确认；
// 可选 offset/limit 分页，缺省全量；列表按完成时间倒序）
eagleApi.get('/organize/results', async (c) => {
  const statusParam = c.req.query('status')
  const knownStatuses: OrganizeItemStatus[] = [
    'pending',
    'success',
    'failed',
    'skipped',
    'confirmed',
  ]
  const status = knownStatuses.includes(statusParam as OrganizeItemStatus)
    ? (statusParam as OrganizeItemStatus)
    : undefined
  const offset = Number.parseInt(c.req.query('offset') ?? '', 10)
  const limit = Number.parseInt(c.req.query('limit') ?? '', 10)
  const data = await organizeService.listResults(status, {
    offset: Number.isFinite(offset) ? Math.max(0, offset) : undefined,
    limit: Number.isFinite(limit) ? Math.max(0, limit) : undefined,
  })
  return c.json({ success: true as const, data })
})

// 单图结果详情（附条目当前名称，供确认页对比建议标题）
eagleApi.get('/organize/results/:itemId', async (c) => {
  const itemId = c.req.param('itemId')
  const data = await organizeService.getResult(itemId)
  if (!data) {
    return c.json({ success: false as const, error: '结果不存在' }, 404)
  }
  return c.json({ success: true as const, data })
})

// 确认结果：移入选中的候选文件夹（withTitle 决定是否同时修改标题），写 Eagle 库
eagleApi.post(
  '/organize/results/:itemId/confirm',
  zValidator(
    'json',
    z.object({ folderPath: z.string().min(1), withTitle: z.boolean() }),
  ),
  async (c) => {
    const body = c.req.valid('json')
    const result = await organizeService.confirmItem(
      c.req.param('itemId'),
      body.folderPath,
      body.withTitle,
    )
    if (!result.ok) {
      return c.json(
        { success: false as const, error: result.error },
        result.status,
      )
    }
    return c.json({ success: true as const, data: null })
  },
)

// 不处理：不做任何修改，标记为 skipped
eagleApi.post('/organize/results/:itemId/skip', async (c) => {
  const result = await organizeService.skipItem(c.req.param('itemId'))
  if (!result.ok) {
    return c.json(
      { success: false as const, error: result.error },
      result.status,
    )
  }
  return c.json({ success: true as const, data: null })
})

// 清除分类后手动处理：清空 Eagle 文件夹归属，标记为 skipped
eagleApi.post('/organize/results/:itemId/clear-classification', async (c) => {
  const result = await organizeService.clearItemClassification(
    c.req.param('itemId'),
  )
  if (!result.ok) {
    return c.json(
      { success: false as const, error: result.error },
      result.status,
    )
  }
  return c.json({ success: true as const, data: null })
})

// 重新执行单图：仅该图重新入队判定，phase 拉回 running
eagleApi.post('/organize/results/:itemId/retry', async (c) => {
  const result = await organizeService.retryItem(c.req.param('itemId'))
  if (!result.ok) {
    return c.json(
      { success: false as const, error: result.error },
      result.status,
    )
  }
  return c.json({ success: true as const, data: null })
})

export default eagleApi
