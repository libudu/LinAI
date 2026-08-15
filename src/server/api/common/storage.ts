import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { changeBus } from '../../common/storage/change-bus'
import { StorageError } from '../../common/storage/errors'
import { storageRegistry } from '../../common/storage/registry'
// 注册所有通用存储资源（副作用）
import '../../common/storage/resources'

/**
 * 通用集合存储接口：客户端只能通过已注册的资源 ID 访问，value 由前端定义。
 * 错误统一抛 StorageError，由全局 onError 映射为 404/409/500。
 */
const storageApi = new Hono()
  .get('/collections/:resource', async (c) => {
    const store = storageRegistry.getCollection(c.req.param('resource'))
    const snapshot = await store.getSnapshot()
    return c.json({
      success: true as const,
      revision: snapshot.revision,
      data: { items: snapshot.items },
    })
  })
  .post(
    '/collections/:resource',
    zValidator(
      'json',
      z.object({
        value: z.unknown(),
        id: z.string().max(64).optional(),
      }),
    ),
    async (c) => {
      const store = storageRegistry.getCollection(c.req.param('resource'))
      const { value, id } = c.req.valid('json')
      const item = await store.create(value, id)
      return c.json({ success: true as const, data: item })
    },
  )
  .put(
    '/collections/:resource/:id',
    zValidator(
      'json',
      z.object({
        value: z.unknown(),
        expectedRevision: z.number().int().min(0).optional(),
      }),
    ),
    async (c) => {
      const store = storageRegistry.getCollection(c.req.param('resource'))
      const { value, expectedRevision } = c.req.valid('json')
      const item = await store.replace(
        c.req.param('id'),
        value,
        expectedRevision,
      )
      return c.json({ success: true as const, data: item })
    },
  )
  .delete('/collections/:resource/:id', async (c) => {
    const store = storageRegistry.getCollection(c.req.param('resource'))
    await store.remove(c.req.param('id'))
    return c.json({ success: true as const })
  })
  .post(
    '/collections/:resource/batch',
    zValidator(
      'json',
      z.object({
        expectedRevision: z.number().int().min(0).optional(),
        operations: z
          .array(
            z.discriminatedUnion('type', [
              z.object({
                type: z.literal('create'),
                value: z.unknown(),
                id: z.string().max(64).optional(),
              }),
              z.object({
                type: z.literal('replace'),
                id: z.string(),
                value: z.unknown(),
              }),
              z.object({ type: z.literal('delete'), id: z.string() }),
            ]),
          )
          .min(1)
          .max(500),
      }),
    ),
    async (c) => {
      const store = storageRegistry.getCollection(c.req.param('resource'))
      const { operations, expectedRevision } = c.req.valid('json')
      await store.batch(operations, expectedRevision)
      return c.json({ success: true as const })
    },
  )
  // ---------- 实体存储：每个实体一个文件，列表只返回摘要 ----------
  .get('/entities/:resource', async (c) => {
    const store = storageRegistry.getEntity(c.req.param('resource'))
    const items = await store.list()
    return c.json({ success: true as const, data: { items } })
  })
  .post(
    '/entities/:resource',
    zValidator(
      'json',
      z.object({
        value: z.unknown(),
        summary: z.unknown().optional(),
        id: z.string().max(64).optional(),
      }),
    ),
    async (c) => {
      const store = storageRegistry.getEntity(c.req.param('resource'))
      const { value, summary, id } = c.req.valid('json')
      const entity = await store.create(value, summary ?? {}, id)
      return c.json({ success: true as const, data: entity })
    },
  )
  .get('/entities/:resource/:id', async (c) => {
    const store = storageRegistry.getEntity(c.req.param('resource'))
    const entity = await store.get(c.req.param('id'))
    return c.json({ success: true as const, data: entity })
  })
  .put(
    '/entities/:resource/:id',
    zValidator(
      'json',
      z.object({
        value: z.unknown(),
        summary: z.unknown().optional(),
        expectedRevision: z.number().int().min(0).optional(),
      }),
    ),
    async (c) => {
      const store = storageRegistry.getEntity(c.req.param('resource'))
      const { value, summary, expectedRevision } = c.req.valid('json')
      const entity = await store.replace(
        c.req.param('id'),
        value,
        summary ?? {},
        expectedRevision,
      )
      return c.json({ success: true as const, data: entity })
    },
  )
  .delete('/entities/:resource/:id', async (c) => {
    const store = storageRegistry.getEntity(c.req.param('resource'))
    await store.remove(c.req.param('id'))
    return c.json({ success: true as const })
  })
  // ---------- 资源变更事件：只发送资源 ID 与版本信息，前端按需重新读取 ----------
  // 可订阅的资源包括通用存储资源与后端专用服务登记的资源（如 image.tasks）
  .get('/events', (c) => {
    const resources = (c.req.query('resources') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (resources.length === 0) {
      throw new StorageError('INVALID_RESOURCE', '缺少 resources 查询参数')
    }
    for (const resource of resources) {
      if (!changeBus.has(resource)) {
        throw new StorageError('INVALID_RESOURCE', `未登记的资源: ${resource}`)
      }
    }
    return streamSSE(c, async (stream) => {
      let aborted = false
      const unsubscribes = resources.map((resource) =>
        changeBus.subscribe(resource, (change) => {
          if (aborted) return
          stream
            .writeSSE({ event: 'change', data: JSON.stringify(change) })
            .catch(() => undefined)
        }),
      )
      stream.onAbort(() => {
        aborted = true
        for (const unsubscribe of unsubscribes) unsubscribe()
      })
      // 保持连接活跃
      while (!aborted) {
        await stream.sleep(30000)
        if (aborted) break
        try {
          await stream.writeSSE({ data: 'ping', event: 'ping' })
        } catch {
          break
        }
      }
    })
  })

export default storageApi
