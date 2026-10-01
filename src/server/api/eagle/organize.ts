import { Hono } from 'hono'
import { z } from 'zod'
import { organizeService } from '../../module/eagle/organize/service'
import {
  eagleScopeSchema,
  organizeAppendTaskSchema,
  organizeConfirmItemSchema,
  organizeCreateTaskSchema,
  taskIdentitySchema,
} from '../../module/eagle/schemas'
import { actionResponse, errorResponse, validate } from './validation'

// 链式注册保留全部路由输入/输出类型，供 AppType 与 Hono RPC 推导。
const organizeApi = new Hono()
  .get('/prepare', validate('query', eagleScopeSchema), async (c) => {
    const data = await organizeService.prepare(c.req.valid('query'))
    return c.json({ success: true as const, data })
  })
  .get('/status', async (c) => {
    const data = await organizeService.getStatus()
    return c.json({ success: true as const, data })
  })
  .get('/task', async (c) => {
    const data = await organizeService.getTask()
    return c.json({ success: true as const, data })
  })
  .post('/task', validate('json', organizeCreateTaskSchema), async (c) => {
    const { expectedTaskId, ...params } = c.req.valid('json')
    const result = await organizeService.createTask(params, expectedTaskId)
    if (!result.ok) return errorResponse(c, result.status, result.error)
    return c.json({ success: true as const, data: result.task })
  })
  .post(
    '/task/append',
    validate('json', organizeAppendTaskSchema),
    async (c) => {
      const { taskId, ...params } = c.req.valid('json')
      return actionResponse(
        c,
        await organizeService.appendItems(params, taskId),
      )
    },
  )
  .get('/failed-items', async (c) => {
    const data = await organizeService.listFailedItems()
    return c.json({ success: true as const, data })
  })
  .post('/task/skip-failed', validate('json', taskIdentitySchema), async (c) =>
    actionResponse(
      c,
      await organizeService.skipFailedItems(c.req.valid('json').taskId),
    ),
  )
  // 暂停只停止派发，已发送的请求继续完成。
  .post('/task/pause', validate('json', taskIdentitySchema), async (c) => {
    const ok = await organizeService.pauseTask(c.req.valid('json').taskId)
    if (!ok) return errorResponse(c, 409, '任务当前不在执行中')
    return c.json({ success: true as const, data: null })
  })
  .post('/task/resume', validate('json', taskIdentitySchema), async (c) => {
    const ok = await organizeService.resumeTask(c.req.valid('json').taskId)
    if (!ok) return errorResponse(c, 409, '任务当前不在暂停状态')
    return c.json({ success: true as const, data: null })
  })
  .post(
    '/task/sync-standards',
    validate('json', taskIdentitySchema),
    async (c) =>
      actionResponse(
        c,
        await organizeService.syncStandards(c.req.valid('json').taskId),
      ),
  )
  .post('/task/retry-failed', validate('json', taskIdentitySchema), async (c) =>
    actionResponse(
      c,
      await organizeService.retryFailedItems(c.req.valid('json').taskId),
    ),
  )
  .post(
    '/task/classify-successful',
    validate('json', taskIdentitySchema),
    async (c) =>
      actionResponse(
        c,
        await organizeService.classifySuccessfulItems(
          c.req.valid('json').taskId,
        ),
      ),
  )
  // 清空等待执行器退出后再删结果，任务身份在命令锁内校验。
  .post('/task/clear', validate('json', taskIdentitySchema), async (c) => {
    await organizeService.clearTask(c.req.valid('json').taskId)
    return c.json({ success: true as const, data: null })
  })
  .get(
    '/queue',
    validate(
      'query',
      z.object({
        limit: z.coerce.number().int().min(1).max(50).default(20),
      }),
    ),
    async (c) => {
      const data = await organizeService.getQueue(c.req.valid('query').limit)
      return c.json({ success: true as const, data })
    },
  )
  // GET 只读取结果，不写盘、不修复状态、不占用用户命令锁。
  .get(
    '/results',
    validate(
      'query',
      z.object({
        status: z
          .enum(['pending', 'success', 'failed', 'skipped', 'confirmed'])
          .optional(),
        offset: z.coerce.number().int().nonnegative().optional(),
        limit: z.coerce.number().int().nonnegative().optional(),
      }),
    ),
    async (c) => {
      const { status, ...options } = c.req.valid('query')
      const data = await organizeService.listResults(status, options)
      return c.json({ success: true as const, data })
    },
  )
  // 缺失结果校准是独立修改命令，确认页进入时显式调用。
  .post('/results/reconcile', validate('json', taskIdentitySchema), async (c) =>
    actionResponse(
      c,
      await organizeService.reconcileResults(c.req.valid('json').taskId),
    ),
  )
  .post(
    '/results/confirm-batch',
    validate(
      'json',
      taskIdentitySchema.extend({
        items: z.array(organizeConfirmItemSchema).min(1),
      }),
    ),
    async (c) => {
      const body = c.req.valid('json')
      const data = await organizeService.confirmBatch(body.items, body.taskId)
      return c.json({ success: true as const, data })
    },
  )
  .get('/results/:itemId', async (c) => {
    const data = await organizeService.getResult(c.req.param('itemId'))
    if (!data) return errorResponse(c, 404, '结果不存在')
    return c.json({ success: true as const, data })
  })
  .post(
    '/results/:itemId/confirm',
    validate(
      'json',
      taskIdentitySchema.merge(
        organizeConfirmItemSchema.omit({ itemId: true }),
      ),
    ),
    async (c) => {
      const body = c.req.valid('json')
      return actionResponse(
        c,
        await organizeService.confirmItem(
          body.taskId,
          c.req.param('itemId'),
          body.folderPath,
          body.withTitle,
          body.folderId,
        ),
      )
    },
  )
  .post(
    '/results/:itemId/trash',
    validate('json', taskIdentitySchema),
    async (c) => {
      const result = await organizeService.trashItem(
        c.req.param('itemId'),
        c.req.valid('json').taskId,
      )
      if (!result.ok) return errorResponse(c, result.status, result.error)
      return c.json({
        success: true as const,
        data: { missing: result.missing },
      })
    },
  )
  .post(
    '/results/:itemId/skip',
    validate('json', taskIdentitySchema),
    async (c) =>
      actionResponse(
        c,
        await organizeService.skipItem(
          c.req.param('itemId'),
          c.req.valid('json').taskId,
        ),
      ),
  )
  .post(
    '/results/:itemId/clear-classification',
    validate('json', taskIdentitySchema),
    async (c) =>
      actionResponse(
        c,
        await organizeService.clearItemClassification(
          c.req.param('itemId'),
          c.req.valid('json').taskId,
        ),
      ),
  )
  .post(
    '/results/:itemId/retry',
    validate('json', taskIdentitySchema),
    async (c) =>
      actionResponse(
        c,
        await organizeService.retryItem(
          c.req.param('itemId'),
          c.req.valid('json').taskId,
        ),
      ),
  )

export default organizeApi
