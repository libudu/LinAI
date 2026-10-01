import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import {
  deleteImageTask,
  getImageTaskIds,
  getImageTaskOutputs,
  getImageTaskPage,
  getImageTasks,
  getImageTaskSummary,
  ImageTaskCancellationError,
} from '../../module/gpt-image/tasks'

/** 生图任务接口仍挂载 /api/task；路由只负责 HTTP，取消与清理由业务服务编排。 */
const taskApi = new Hono()
  .get('/', async (c) => {
    const tasks = await getImageTasks()
    return c.json({ success: true as const, data: tasks })
  })
  .get(
    '/page',
    zValidator(
      'query',
      z.object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(10),
      }),
    ),
    async (c) => {
      const { page, pageSize } = c.req.valid('query')
      return c.json({
        success: true as const,
        data: await getImageTaskPage(page, pageSize),
      })
    },
  )
  .get('/summary', async (c) =>
    c.json({ success: true as const, data: await getImageTaskSummary() }),
  )
  .get('/outputs', async (c) =>
    c.json({ success: true as const, data: await getImageTaskOutputs() }),
  )
  .get(
    '/ids',
    zValidator(
      'query',
      z.object({
        status: z
          .enum(['pending', 'running', 'completed', 'failed'])
          .optional(),
      }),
    ),
    async (c) =>
      c.json({
        success: true as const,
        data: await getImageTaskIds(c.req.valid('query').status),
      }),
  )
  .delete(
    '/:id',
    zValidator('param', z.object({ id: z.string() })),
    zValidator('query', z.object({ keepImage: z.string().optional() })),
    async (c) => {
      const { id } = c.req.valid('param')
      const { keepImage } = c.req.valid('query')
      try {
        const deleted = await deleteImageTask(id, keepImage === 'true')
        if (!deleted) {
          return c.json(
            { success: false as const, error: 'Task not found' },
            404,
          )
        }
        return c.json({ success: true as const })
      } catch (error) {
        if (error instanceof ImageTaskCancellationError) {
          return c.json({ success: false as const, error: error.message }, 502)
        }
        throw error
      }
    },
  )

export default taskApi
