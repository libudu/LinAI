import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import fs from 'fs-extra'
import path from 'path'
import { TemplateManager } from '../common/template-manager'

export const templateManager = new TemplateManager()
const templateApi = new Hono()
  // Chain route declarations so Hono preserves the route type for the client.
  .get(
    '/images/:filename',
    zValidator('param', z.object({ filename: z.string() })),
    async (c) => {
      const { filename } = c.req.valid('param')
      const filepath = path.join(process.cwd(), 'data', 'images', filename)
      if (fs.existsSync(filepath)) {
        const file = await fs.readFile(filepath)
        const ext = path.extname(filename).slice(1)
        let mimeType = ext === 'jpg' ? 'jpeg' : ext
        if (ext === 'webp') {
          mimeType = 'webp'
        }
        c.header('Content-Type', `image/${mimeType}`)
        return c.body(file)
      }
      return c.notFound()
    }
  )
  .get('/', async (c) => {
    try {
      const templates = await templateManager.getTemplates()
      return c.json({ success: true as const, data: templates })
    } catch (error: any) {
      return c.json({ success: false as const, error: error.message }, 500)
    }
  })
  .post(
    '/',
    zValidator(
      'json',
      z.object({
        title: z.string().optional(),
        images: z.array(z.string()),
        prompt: z.string(),
        usageType: z.enum(['image', 'video'])
      })
    ),
    async (c) => {
      try {
        const body = c.req.valid('json')
        const newTemplate = await templateManager.addTemplate(body)
        return c.json({ success: true as const, data: newTemplate })
      } catch (error: any) {
        return c.json({ success: false as const, error: error.message }, 500)
      }
    }
  )
  .delete(
    '/:id',
    zValidator('param', z.object({ id: z.string() })),
    async (c) => {
      try {
        const { id } = c.req.valid('param')
        const success = await templateManager.deleteTemplate(id)
        if (!success) {
          return c.json(
            { success: false as const, error: 'Template not found' },
            404
          )
        }
        return c.json({ success: true as const })
      } catch (error: any) {
        return c.json({ success: false as const, error: error.message }, 500)
      }
    }
  )

export default templateApi
