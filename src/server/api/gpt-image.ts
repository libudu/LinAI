import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { templateManager } from '../common/template-manager'
import { TaskTemplate } from '../common/template-manager'
import { handleImageGeneration } from '../common/gpt-image'

const gptImageApi = new Hono()
  .post(
    '/generate',
    zValidator(
      'json',
      z.object({
        apiKey: z.string().min(1, 'API Key is required'),
        templateId: z.string().min(1, 'Template ID is required'),
        size: z.enum(['1k', '2k']).optional().default('2k')
      })
    ),
    async (c) => {
      const { apiKey, templateId, size } = c.req.valid('json')
      const templates = await templateManager.getTemplates()
      const template = templates.find((t) => t.id === templateId)
      if (!template) {
        return c.json(
          { success: false as const, error: 'Template not found' },
          404
        )
      }
      const result = await handleImageGeneration({
        apiKey,
        template,
        size: size === '2k' ? 2048 : 1024
      })
      return c.json(result.data)
    }
  )
  .post(
    '/trial',
    zValidator(
      'json',
      z.object({
        apiKey: z.string().min(1, 'API Key is required'),
        prompt: z.string().min(1, 'Prompt is required'),
        aspectRatio: z.string().optional().default('1:1'),
        images: z.array(z.string()).optional()
      })
    ),
    async (c) => {
      const { apiKey, prompt, aspectRatio, images } = c.req.valid('json')
      const template: TaskTemplate = {
        id: uuidv4(),
        createdAt: Date.now(),
        prompt,
        aspectRatio,
        usageType: 'image',
        images: images || [],
        title: 'Trial Template'
      }
      const result = await handleImageGeneration({
        apiKey,
        template,
        quality: 'low',
        size: 1024
      })
      return c.json(result.data, result.status as any)
    }
  )

export default gptImageApi
