import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { templateManager } from '../../common/template-manager'

const templateApi = new Hono()
  // Chain route declarations so Hono preserves the route type for the client.
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
        usageType: z.enum(['image', 'video']),
        aspectRatio: z.string().optional(),
        folder: z.string().optional(),
      }),
    ),
    async (c) => {
      try {
        const body = c.req.valid('json')
        const newTemplate = await templateManager.addTemplate(body)
        return c.json({ success: true as const, data: newTemplate })
      } catch (error: any) {
        return c.json({ success: false as const, error: error.message }, 500)
      }
    },
  )
  .put(
    '/folder/rename',
    zValidator(
      'json',
      z.object({
        oldFolder: z.string(),
        newFolder: z.string(),
      }),
    ),
    async (c) => {
      try {
        const { oldFolder, newFolder } = c.req.valid('json')
        const updatedCount = await templateManager.renameFolder(
          oldFolder,
          newFolder,
        )
        return c.json({ success: true as const, data: { updatedCount } })
      } catch (error: any) {
        return c.json({ success: false as const, error: error.message }, 500)
      }
    },
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
            404,
          )
        }
        return c.json({ success: true as const })
      } catch (error: any) {
        return c.json({ success: false as const, error: error.message }, 500)
      }
    },
  )
  .put(
    '/:id',
    zValidator('param', z.object({ id: z.string() })),
    zValidator(
      'json',
      z.object({
        title: z.string().optional(),
        prompt: z.string().optional(),
        aspectRatio: z.string().optional(),
        folder: z.string().optional(),
        images: z.array(z.string()).optional(),
      }),
    ),
    async (c) => {
      try {
        const { id } = c.req.valid('param')
        const updates = c.req.valid('json')
        const updatedTemplate = await templateManager.updateTemplate(
          id,
          updates,
        )
        if (!updatedTemplate) {
          return c.json(
            { success: false as const, error: 'Template not found' },
            404,
          )
        }
        return c.json({ success: true as const, data: updatedTemplate })
      } catch (error: any) {
        return c.json({ success: false as const, error: error.message }, 500)
      }
    },
  )

export default templateApi
