import { Hono } from 'hono'
import fs from 'fs-extra'
import path from 'path'
import { TaskManager } from '../common/task-manager'

export const taskManager = new TaskManager()
const taskApi = new Hono()

// 获取指定模块的执行中任务（或者所有任务）
taskApi.get('/:moduleId', async (c) => {
  const moduleId = c.req.param('moduleId')
  try {
    const tasks = await taskManager.getTasksBySource(moduleId)
    return c.json({ success: true as const, data: tasks })
  } catch (error: any) {
    return c.json({ success: false as const, error: error.message }, 500)
  }
})

// 从模板创建任务
taskApi.post('/:moduleId/from-template', async (c) => {
  const moduleId = c.req.param('moduleId')
  try {
    const { templateId } = await c.req.json()
    if (!templateId) {
      return c.json({ success: false as const, error: 'templateId is required' }, 400)
    }
    const newTask = await taskManager.createTaskFromTemplate(templateId)
    if (!newTask) {
      return c.json({ success: false as const, error: 'Template not found' }, 404)
    }
    // Since it's created for this module, ensure source matches
    if (newTask.source !== moduleId) {
      // Option to reject or just ignore. Assuming the frontend passes correct templateId.
    }
    return c.json({ success: true as const, data: newTask })
  } catch (error: any) {
    return c.json({ success: false as const, error: error.message }, 500)
  }
})

// 删除任务
taskApi.delete('/:moduleId/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const success = await taskManager.deleteTask(id)
    return c.json({ success: success as boolean })
  } catch (error: any) {
    return c.json({ success: false as const, error: error.message }, 500)
  }
})

// Serve uploaded images (for backward compatibility or task images)
taskApi.get('/images/:filename', async (c) => {
  const filename = c.req.param('filename')
  const filepath = path.join(process.cwd(), 'data', 'images', filename)
  if (fs.existsSync(filepath)) {
    const file = await fs.readFile(filepath)
    const ext = path.extname(filename).slice(1)
    c.header('Content-Type', `image/${ext === 'jpg' ? 'jpeg' : ext}`)
    return c.body(file)
  }
  return c.notFound()
})

export default taskApi
