import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { taskService } from '../../common/task'

/**
 * 任务接口：任务由后端 TaskService 生成和流转，前端只能读取列表与删除。
 * 变更通知走统一变更总线：GET /api/storage/events?resources=image.tasks
 */
const taskApi = new Hono()
  // Chain route declarations so Hono keeps the full client route map in AppType.
  .get('/', async (c) => {
    const tasks = await taskService.getTasks()
    return c.json({ success: true as const, data: tasks })
  })
  .delete(
    '/:id',
    zValidator('param', z.object({ id: z.string() })),
    zValidator('query', z.object({ keepImage: z.string().optional() })),
    async (c) => {
      const { id } = c.req.valid('param')
      const { keepImage } = c.req.valid('query')
      const deleted = await taskService.deleteTask(id, keepImage === 'true')
      if (!deleted) {
        return c.json({ success: false as const, error: 'Task not found' }, 404)
      }
      return c.json({ success: true as const })
    },
  )

export default taskApi
