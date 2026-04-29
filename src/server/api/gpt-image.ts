import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { getConfig } from '../common/config'
import { TaskTemplate, templateManager } from '../common/template-manager'
import { TRIAL_TEMPLATE_TITLE } from '../common/template-manager/enum'
import { handleImageGeneration } from '../module/gpt-image'

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
        400,
      )
    }

    try {
      const response = await fetch('https://yunwu.ai/api/usage/token/', {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      })
      const data: GPTImageQuotaResponse = await response.json()
      if (!response.ok || data.message) {
        return c.json(
          {
            success: false as const,
            error: data?.message || '获取余额失败',
          },
          500,
        )
      }
      return c.json({
        success: true as const,
        data: data,
      })
    } catch (error: any) {
      return c.json(
        { success: false as const, error: error.message || '获取余额失败' },
        500,
      )
    }
  })
  .post(
    '/generate',
    zValidator(
      'json',
      z.object({
        templateId: z.string().min(1, 'Template ID is required'),
        size: z.enum(['1k', '2k', '4k']),
        quality: z.enum(['medium', 'high']),
      }),
    ),
    async (c) => {
      const { templateId, size, quality } = c.req.valid('json')
      const config = getConfig()
      const apiKey = config.gptImageApiKey
      if (!apiKey) {
        return c.json(
          { success: false as const, error: 'API Key is not configured' },
          400,
        )
      }
      const templates = await templateManager.getTemplates()
      const template = templates.find((t) => t.id === templateId)
      if (!template) {
        return c.json(
          { success: false as const, error: 'Template not found' },
          404,
        )
      }
      const result = await handleImageGeneration({
        apiKey,
        template,
        size,
        quality,
      })
      return c.json(result.data)
    },
  )
  .post(
    '/trial',
    zValidator(
      'json',
      z.object({
        prompt: z.string().min(1, 'Prompt is required'),
        aspectRatio: z.string().optional().default('1:1'),
        images: z.array(z.string()).optional(),
        size: z.enum(['1k', '2k', '4k']).optional().default('1k'),
        quality: z.enum(['medium', 'high']).optional().default('medium'),
      }),
    ),
    async (c) => {
      const { prompt, aspectRatio, images, size, quality } = c.req.valid('json')
      const config = getConfig()
      const apiKey = config.gptImageApiKey
      if (!apiKey) {
        return c.json(
          { success: false as const, error: 'API Key is not configured' },
          400,
        )
      }
      const template: TaskTemplate = {
        id: uuidv4(),
        createdAt: Date.now(),
        prompt,
        aspectRatio,
        usageType: 'image',
        images: images || [],
        title: TRIAL_TEMPLATE_TITLE,
      }
      const result = await handleImageGeneration({
        apiKey,
        template,
        size,
        quality,
      })
      return c.json(result.data, result.status as any)
    },
  )
  .post(
    '/generate-api-key',
    zValidator(
      'json',
      z.object({
        systemToken: z.string().min(1, 'System Token is required'),
        userId: z.string().min(1, 'User ID is required'),
        name: z.string().min(1, 'Name is required'),
        quota: z.number().min(0, 'Quota must be a positive number'),
        group: z.string(),
      }),
    ),
    async (c) => {
      const { systemToken, userId, name, quota, group } = c.req.valid('json')
      try {
        const response = await fetch('https://yunwu.ai/api/token/', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'new-api-user': userId,
            ...(systemToken ? { Authorization: systemToken } : {}),
          },
          body: JSON.stringify({
            remain_quota: quota * 1000000,
            expired_time: -1,
            unlimited_quota: false,
            model_limits_enabled: false,
            model_limits: '',
            group,
            mj_image_mode: 'default',
            mj_custom_proxy: '',
            selected_groups: [],
            name: name,
            allow_ips: '',
          }),
        })
        const data = await response.json()
        return c.json(
          data as { success?: boolean; data: string; message?: string },
        )
      } catch (error: any) {
        return c.json(
          {
            success: false as const,
            message: error.message || '生成失败',
            data: null,
          },
          500,
        )
      }
    },
  )

export default gptImageApi
