import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { TaskManager } from '../../common/task-manager'

export const taskManager = new TaskManager()
const taskApi = new Hono()
  // Chain route declarations so Hono keeps the full client route map in AppType.
  .get('/', async (c) => {
    try {
      const tasks = await taskManager.getTasks()
      return c.json({ success: true as const, data: tasks })
    } catch (error: any) {
      return c.json({ success: false as const, error: error.message }, 500)
    }
  })
  .get('/stream', (c) => {
    return streamSSE(c, async (stream) => {
      let aborted = false
      // Send initial tasks
      try {
        const initialTasks = await taskManager.getTasks()
        await stream.writeSSE({
          data: JSON.stringify({ success: true, data: initialTasks }),
          event: 'message',
        })
      } catch (error: any) {
        await stream.writeSSE({
          data: JSON.stringify({ success: false, error: error.message }),
          event: 'error',
        })
      }

      // Listen for updates
      const listener = async (tasks: any[]) => {
        if (aborted) return
        try {
          await stream.writeSSE({
            data: JSON.stringify({ success: true, data: tasks }),
            event: 'message',
          })
        } catch (e) {
          console.error('Failed to send SSE update:', e)
        }
      }

      taskManager.on('tasks-updated', listener)

      // Cleanup on disconnect
      stream.onAbort(() => {
        aborted = true
        taskManager.off('tasks-updated', listener)
      })

      // Keep connection alive
      while (!aborted) {
        await stream.sleep(30000)
        if (aborted) break
        try {
          await stream.writeSSE({
            data: 'ping',
            event: 'ping',
          })
        } catch (e) {
          break
        }
      }
    })
  })
  .delete(
    '/:id',
    zValidator('param', z.object({ id: z.string() })),
    async (c) => {
      try {
        const { id } = c.req.valid('param')
        const result = await taskManager.deleteTask(id)
        if (!result.success) {
          return c.json(
            {
              success: false as const,
              error: result.error || 'Failed to delete task',
            },
            404,
          )
        }
        return c.json({ success: true as const })
      } catch (error: any) {
        return c.json({ success: false as const, error: error.message }, 500)
      }
    },
  )

export default taskApi
