import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { templateManager } from '../common/template-manager/index'
import { geminiManager } from '../module/gemini-manager/index'

const geminiApi = new Hono().post(
  '/generate',
  zValidator(
    'json',
    z.object({
      apiKey: z.string().min(1, 'API Key is required'),
      templateId: z.string().min(1, 'Template ID is required'),
    }),
  ),
  async (c) => {
    try {
      const { apiKey, templateId } = c.req.valid('json')

      const templates = await templateManager.getTemplates()
      const template = templates.find((t) => t.id === templateId)

      if (!template) {
        return c.json({ success: false, error: 'Template not found' }, 404)
      }

      if (template.usageType !== 'image') {
        return c.json(
          { success: false, error: 'Template is not a Gemini template' },
          400,
        )
      }

      const result = await geminiManager.generateImage(apiKey, template.prompt)

      if (result.success) {
        return c.json({ success: true, image: result.image })
      } else {
        return c.json({ success: false, error: result.error }, 500)
      }
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500)
    }
  },
)

export default geminiApi
