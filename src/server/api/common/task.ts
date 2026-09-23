import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { taskService } from '../../common/task'
import { cancelComfyTaskForDeletion } from '../../module/gpt-image/comfyui'
import { COMFY_IMAGE_SOURCE } from '../../module/gpt-image/enum'

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
      const task = (await taskService.getTasks()).find((item) => item.id === id)
      if (!task) {
        return c.json({ success: false as const, error: 'Task not found' }, 404)
      }
      const cancelling =
        task.source === COMFY_IMAGE_SOURCE &&
        (task.status === 'pending' || task.status === 'running')
      if (cancelling) {
        try {
          await cancelComfyTaskForDeletion(task)
        } catch (error) {
          return c.json(
            {
              success: false as const,
              error:
                error instanceof Error
                  ? error.message
                  : '取消 ComfyUI 任务失败',
            },
            502,
          )
        }
      }
      let deleted: boolean
      try {
        deleted = await taskService.deleteTask(id, keepImage === 'true')
      } catch (error) {
        if (cancelling) {
          await taskService
            .updateActiveTask(id, {
              status: 'failed',
              error: '[服务] ComfyUI 已取消，但删除任务记录失败',
            })
            .catch(console.error)
        }
        throw error
      }
      if (!deleted) {
        return c.json({ success: false as const, error: 'Task not found' }, 404)
      }
      return c.json({ success: true as const })
    },
  )

export default taskApi
