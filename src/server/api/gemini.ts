import { Hono } from 'hono'
import { geminiManager } from '../module/gemini-manager/index'
import { TaskManager } from '../module/task-manager/index'

const taskManager = new TaskManager()

const geminiApi = new Hono().post('/generate', async (c) => {
  try {
    const body = await c.req.json()
    const { apiKey, templateId } = body

    if (!apiKey) {
      return c.json({ success: false, error: 'API Key is required' }, 400)
    }

    if (!templateId) {
      return c.json({ success: false, error: 'Template ID is required' }, 400)
    }

    const templates = await taskManager.getTemplates()
    const template = templates.find(t => t.id === templateId)

    if (!template) {
      return c.json({ success: false, error: 'Template not found' }, 404)
    }

    if (template.source !== 'gemini-image') {
      return c.json({ success: false, error: 'Template is not a Gemini template' }, 400)
    }

    const result = await geminiManager.generateImage(apiKey, template.prompt, template.aspectRatio)

    if (result.success) {
      return c.json({ success: true, image: result.image })
    } else {
      return c.json({ success: false, error: result.error }, 500)
    }
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

export default geminiApi
