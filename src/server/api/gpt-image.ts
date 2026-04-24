import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { templateManager } from '../common/template-manager'
import { TaskTemplate } from '../common/template-manager'
import { handleImageGeneration } from '../common/gpt-image'
import { getConfig } from '../common/config'
import { TRIAL_TEMPLATE_TITLE } from '../common/template-manager/enum'

export interface GPTImageQuotaResponse {
  message: string
  data: {
    expires_at: number
    name: string
    total_available: number
    total_granted: number
    total_used: number
    unlimited_quota: boolean
  }
}

const gptImageApi = new Hono()
  .get('/quota', async (c) => {
    const config = getConfig()
    const apiKey = config.gptImageApiKey
    if (!apiKey) {
      return c.json(
        { success: false as const, error: 'API Key is not configured' },
        400
      )
    }

    try {
      const response = await fetch('https://yunwu.ai/api/usage/token/', {
        headers: {
          Authorization: `Bearer ${apiKey}`
        }
      })
      const data: GPTImageQuotaResponse = await response.json()
      if (!response.ok || data.message) {
        return c.json(
          {
            success: false as const,
            error: data?.message || '获取余额失败'
          },
          500
        )
      }
      return c.json({
        success: true as const,
        data: data
      })
    } catch (error: any) {
      return c.json(
        { success: false as const, error: error.message || '获取余额失败' },
        500
      )
    }
  })
  .post(
    '/generate',
    zValidator(
      'json',
      z.object({
        templateId: z.string().min(1, 'Template ID is required'),
        size: z.enum(['1k', '2k']).optional().default('2k')
      })
    ),
    async (c) => {
      const { templateId, size } = c.req.valid('json')
      const config = getConfig()
      const apiKey = config.gptImageApiKey
      if (!apiKey) {
        return c.json(
          { success: false as const, error: 'API Key is not configured' },
          400
        )
      }
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
        prompt: z.string().min(1, 'Prompt is required'),
        aspectRatio: z.string().optional().default('1:1'),
        images: z.array(z.string()).optional()
      })
    ),
    async (c) => {
      const { prompt, aspectRatio, images } = c.req.valid('json')
      const config = getConfig()
      const apiKey = config.gptImageApiKey
      if (!apiKey) {
        return c.json(
          { success: false as const, error: 'API Key is not configured' },
          400
        )
      }
      const template: TaskTemplate = {
        id: uuidv4(),
        createdAt: Date.now(),
        prompt,
        aspectRatio,
        usageType: 'image',
        images: images || [],
        title: TRIAL_TEMPLATE_TITLE
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
