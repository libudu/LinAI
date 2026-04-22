import { streamSSE } from 'hono/streaming'
import { Logger } from '../module/utils/logger'
import { TaskManager } from '../module/task-manager'
import { Context } from 'hono'

/**
 * 创建日志 SSE 流的辅助函数
 */
export async function handleLogSSE(c: Context, logger: Logger) {
  return streamSSE(c, async (stream) => {
    // 发送初始日志
    const initialLogs = logger.getLogs(100)
    for (const log of initialLogs) {
      await stream.writeSSE({
        data: log,
        event: 'log'
      })
    }

    // 监听新日志
    const onLog = async (message: string) => {
      try {
        await stream.writeSSE({
          data: message,
          event: 'log'
        })
      } catch (e) {
        // 流可能已关闭
        logger.removeListener('log', onLog)
      }
    }

    logger.on('log', onLog)

    c.req.raw.signal.addEventListener('abort', () => {
      logger.removeListener('log', onLog)
    })

    // 保持连接
    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 30000))
      await stream.writeSSE({ data: 'ping', event: 'ping' })
    }
  })
}

/**
 * 绑定日志相关的接口
 */
export function bindLogRoutes(app: any, logger: Logger) {
  app.get('/logs', (c: Context) => handleLogSSE(c, logger))
  app.delete('/logs', (c: Context) => {
    logger.clearLogs()
    return c.json({ success: true })
  })
}

/**
 * 绑定从模板创建任务相关的接口
 */
export function bindTaskTemplateRoutes(app: any, taskManager: TaskManager, source: string) {
  // 获取当前模块的执行中任务（或者所有任务）
  app.get('/tasks', async (c: Context) => {
    try {
      const tasks = await taskManager.getTasksBySource(source)
      return c.json({ success: true, data: tasks })
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500)
    }
  })

  // 从模板创建任务
  app.post('/tasks/from-template', async (c: Context) => {
    try {
      const { templateId } = await c.req.json()
      if (!templateId) {
        return c.json({ success: false, error: 'templateId is required' }, 400)
      }
      const newTask = await taskManager.createTaskFromTemplate(templateId)
      if (!newTask) {
        return c.json({ success: false, error: 'Template not found' }, 404)
      }
      // Since it's created for this module, ensure source matches
      if (newTask.source !== source) {
        // Option to reject or just ignore. Assuming the frontend passes correct templateId.
      }
      return c.json({ success: true, data: newTask })
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500)
    }
  })

  // 删除任务
  app.delete('/tasks/:id', async (c: Context) => {
    try {
      const id = c.req.param('id') as string
      const success = await taskManager.deleteTask(id)
      return c.json({ success })
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500)
    }
  })
}
