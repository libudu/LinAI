import { Hono } from 'hono'
import fs from 'fs-extra'
import path from 'path'
import { TaskManager } from '../module/task-manager'

export const taskManager = new TaskManager()
const taskApi = new Hono()

// Serve uploaded images
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

taskApi.get('/templates', async (c) => {
  const templates = await taskManager.getTemplates()
  return c.json({ success: true, data: templates })
})

taskApi.post('/templates', async (c) => {
  try {
    const body = await c.req.json()
    const newTemplate = await taskManager.addTemplate(body)
    return c.json({ success: true, data: newTemplate })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

taskApi.delete('/templates/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const success = await taskManager.deleteTemplate(id)
    return c.json({ success })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

export default taskApi
