import { Hono } from 'hono'
import fs from 'fs-extra'
import path from 'path'
import { TemplateManager } from '../common/template-manager'

export const templateManager = new TemplateManager()
const templateApi = new Hono()

// Serve uploaded images
templateApi.get('/images/:filename', async (c) => {
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

templateApi.get('/', async (c) => {
  const templates = await templateManager.getTemplates()
  return c.json({ success: true, data: templates })
})

templateApi.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const newTemplate = await templateManager.addTemplate(body)
    return c.json({ success: true, data: newTemplate })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

templateApi.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const success = await templateManager.deleteTemplate(id)
    return c.json({ success })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

export default templateApi
