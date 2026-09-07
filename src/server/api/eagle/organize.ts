import type { OrganizeItemStatus } from '@/shared/eagle/organize'
import {
  ORGANIZE_CONCURRENCY_DEFAULT,
  ORGANIZE_CONCURRENCY_MAX,
  ORGANIZE_CONCURRENCY_MIN,
} from '@/shared/eagle/organize'
import type { EagleSortBy, EagleSortOrder } from '@/shared/eagle/types'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { organizeService } from '../../module/eagle/organize/service'

const organizeApi = new Hono()

// ---------- 图片整理（organize）：任务生命周期与结果读取 ----------

// 步骤 1 准备数据：分类标准列表 + 当前范围内可处理图片数（已排除 gif/视频）
organizeApi.get('/prepare', async (c) => {
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
organizeApi.get('/status', async (c) => {
  const data = await organizeService.getStatus()
  return c.json({ success: true as const, data })
})

// 任务详情（含分类标准快照与进度计数）
organizeApi.get('/task', async (c) => {
  const data = await organizeService.getTask()
  return c.json({ success: true as const, data })
})

// 创建任务：固化分类标准快照，把对应数量的图片加入队列
organizeApi.post(
  '/task',
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
organizeApi.post(
  '/task/append',
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
organizeApi.get('/failed-items', async (c) => {
  const data = await organizeService.listFailedItems()
  return c.json({ success: true as const, data })
})

// 批量跳过所有失败项
organizeApi.post('/task/skip-failed', async (c) => {
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
organizeApi.post('/task/pause', async (c) => {
  const ok = await organizeService.pauseTask()
  if (!ok) {
    return c.json({ success: false as const, error: '任务当前不在执行中' }, 409)
  }
  return c.json({ success: true as const, data: null })
})

organizeApi.post('/task/resume', async (c) => {
  const ok = await organizeService.resumeTask()
  if (!ok) {
    return c.json(
      { success: false as const, error: '任务当前不在暂停状态' },
      409,
    )
  }
  return c.json({ success: true as const, data: null })
})

// 暂停状态下同步最新分类标准：将外部库最新文件夹标准快照更新进当前任务
organizeApi.post('/task/sync-standards', async (c) => {
  const result = await organizeService.syncStandards()
  if (!result.ok) {
    return c.json(
      { success: false as const, error: result.error },
      result.status,
    )
  }
  return c.json({ success: true as const, data: null })
})

// 批量重试失败项：重新加入执行队列并继续执行
organizeApi.post('/task/retry-failed', async (c) => {
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
organizeApi.post('/task/classify-successful', async (c) => {
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
organizeApi.post('/task/clear', async (c) => {
  await organizeService.clearTask()
  return c.json({ success: true as const, data: null })
})

// 执行中步骤的队列预览：执行中/待处理/失败条目（失败附原因），完成无误的项不返回；
// limit 缺省 20（上限 50），返回 total 用于「仅展示前 N 条」提示
organizeApi.get('/queue', async (c) => {
  const limit = Math.min(50, Math.max(1, Number(c.req.query('limit')) || 20))
  const data = await organizeService.getQueue(limit)
  return c.json({ success: true as const, data })
})

// 结果列表（可按状态过滤，如 status=success / failed 表示待确认；
// 可选 offset/limit 分页，缺省全量；列表按完成时间倒序）
organizeApi.get('/results', async (c) => {
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

// 批量确认结果：批量移入选中的候选文件夹并写 Eagle 库
organizeApi.post(
  '/results/confirm-batch',
  zValidator(
    'json',
    z.object({
      items: z
        .array(
          z.object({
            itemId: z.string().min(1),
            folderPath: z.string().min(1),
            folderId: z.string().optional(),
            withTitle: z.boolean(),
          }),
        )
        .min(1),
    }),
  ),
  async (c) => {
    const body = c.req.valid('json')
    const result = await organizeService.confirmBatch(body.items)
    if (!result.ok) {
      return c.json(
        { success: false as const, error: result.error },
        result.status,
      )
    }
    return c.json({ success: true as const, data: null })
  },
)

// 单图结果详情（附条目当前名称，供确认页对比建议标题）
organizeApi.get('/results/:itemId', async (c) => {
  const itemId = c.req.param('itemId')
  const data = await organizeService.getResult(itemId)
  if (!data) {
    return c.json({ success: false as const, error: '结果不存在' }, 404)
  }
  return c.json({ success: true as const, data })
})

// 确认结果：移入选中的候选文件夹（withTitle 决定是否同时修改标题），写 Eagle 库
organizeApi.post(
  '/results/:itemId/confirm',
  zValidator(
    'json',
    z.object({
      folderPath: z.string().min(1),
      folderId: z.string().optional(),
      withTitle: z.boolean(),
    }),
  ),
  async (c) => {
    const body = c.req.valid('json')
    const result = await organizeService.confirmItem(
      c.req.param('itemId'),
      body.folderPath,
      body.withTitle,
      body.folderId,
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
organizeApi.post('/results/:itemId/skip', async (c) => {
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
organizeApi.post('/results/:itemId/clear-classification', async (c) => {
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
organizeApi.post('/results/:itemId/retry', async (c) => {
  const result = await organizeService.retryItem(c.req.param('itemId'))
  if (!result.ok) {
    return c.json(
      { success: false as const, error: result.error },
      result.status,
    )
  }
  return c.json({ success: true as const, data: null })
})

export default organizeApi
