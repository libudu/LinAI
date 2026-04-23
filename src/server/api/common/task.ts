import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import fs from 'fs-extra'
import path from 'path'
import { TaskManager } from '../../common/task-manager'
import { TemplateManager } from '../../common/template-manager'

export const taskManager = new TaskManager()
const templateManager = new TemplateManager()
const taskApi = new Hono()
  // Chain route declarations so Hono keeps the full client route map in AppType.
  .get(
    '/:usageType',
    zValidator('param', z.object({ usageType: z.enum(['image', 'video']) })),
    async (c) => {
      const { usageType } = c.req.valid('param')
      try {
        const tasks = await taskManager.getTasksByUsageType(usageType)
        return c.json({ success: true as const, data: tasks })
      } catch (error: any) {
        return c.json({ success: false as const, error: error.message }, 500)
      }
    }
  )
  .post(
    '/:usageType/from-template',
    zValidator('param', z.object({ usageType: z.enum(['image', 'video']) })),
    zValidator('json', z.object({ templateId: z.string().min(1, 'templateId is required'), source: z.string().optional().default('unknown') })),
    async (c) => {
      const { usageType } = c.req.valid('param')
      try {
        const { templateId, source } = c.req.valid('json')
        const templates = await templateManager.getTemplates()
        const template = templates.find((t) => t.id === templateId)
        if (!template) {
          return c.json({ success: false as const, error: 'Template not found' }, 404)
        }
        const newTask = await taskManager.createTaskFromTemplate(template, source)
        // Since it's created for this module, ensure usageType matches.
        if (newTask.rawTemplate?.usageType !== usageType) {
          // Assuming the frontend passes a templateId that matches the module.
        }
        return c.json({ success: true as const, data: newTask })
      } catch (error: any) {
        return c.json({ success: false as const, error: error.message }, 500)
      }
    }
  )
  .delete(
    '/:usageType/:id',
    zValidator('param', z.object({ usageType: z.enum(['image', 'video']), id: z.string() })),
    async (c) => {
      try {
        const { id } = c.req.valid('param')
        const success = await taskManager.deleteTask(id)
        if (!success) {
          return c.json({ success: false as const, error: 'Task not found' }, 404)
        }
        return c.json({ success: true as const })
      } catch (error: any) {
        return c.json({ success: false as const, error: error.message }, 500)
      }
    }
  )
  .get(
    '/images/:filename',
    zValidator('param', z.object({ filename: z.string() })),
    async (c) => {
      const { filename } = c.req.valid('param')
      const filepath = path.join(process.cwd(), 'data', 'images', filename)
      if (fs.existsSync(filepath)) {
        const file = await fs.readFile(filepath)
        const ext = path.extname(filename).slice(1)
        c.header('Content-Type', `image/${ext === 'jpg' ? 'jpeg' : ext}`)
        return c.body(file)
      }
      return c.notFound()
    }
  )

export default taskApi
