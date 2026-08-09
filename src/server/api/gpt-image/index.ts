import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { TaskTemplate, templateManager } from '../../common/template-manager'
import { TRIAL_TEMPLATE_TITLE } from '../../common/template-manager/enum'
import { handleImageGeneration } from '../../module/gpt-image'
import {
  getGptImageConfig,
  getGptImageEndpoint,
  getYunwuApiKey,
  updateGptImageConfig,
} from '../../module/gpt-image/config'
import { GPT_IMAGE_OUTPUT_MAX_N } from '../../module/gpt-image/enum'
import gptImageEndpointApi from './endpoint'

// 比例拼接：在提示词末尾追加一行“图片比例X：Y”，
// 用于 default 等不支持分辨率/比例参数的便宜分组
function withAspectRatioLine(
  template: TaskTemplate,
  appendAspectRatio?: boolean,
): TaskTemplate {
  if (!appendAspectRatio || !template.aspectRatio) return template
  return {
    ...template,
    prompt: `${template.prompt}\n图片比例${template.aspectRatio.replace(':', '：')}`,
  }
}

const gptImageApi = new Hono()
  // 接入点相关（余额查询等）
  .route('/endpoint', gptImageEndpointApi)
  // 生图模块配置（独立存储 data/images/config.json）
  .get('/config', (c) => {
    return c.json({ success: true as const, data: getGptImageConfig() })
  })
  .post(
    '/config',
    zValidator(
      'json',
      z.object({
        gptImageApiKey: z.string().nullable().optional(),
        gptImageBaseUrl: z.string().nullable().optional(),
        gptImageModelId: z.string().nullable().optional(),
        gptImageCustomEndpoints: z
          .array(
            z.object({
              id: z.string(),
              title: z.string(),
              baseUrl: z.string(),
              modelId: z.string(),
              apiKey: z.string().optional(),
            }),
          )
          .optional(),
        gptImagePresetApiKeys: z.record(z.string(), z.string()).optional(),
      }),
    ),
    (c) => {
      return c.json({
        success: true as const,
        data: updateGptImageConfig(c.req.valid('json')),
      })
    },
  )
  .post(
    '/generate',
    zValidator(
      'json',
      z.object({
        templateId: z.string().min(1, 'Template ID is required'),
        size: z.enum(['1k', '2k', '4k']),
        quality: z.enum(['medium', 'high']),
        appendAspectRatio: z.boolean().optional(),
      }),
    ),
    async (c) => {
      const { templateId, size, quality, appendAspectRatio } =
        c.req.valid('json')
      const apiKey = getYunwuApiKey()
      if (!apiKey) {
        return c.json(
          {
            success: false as const,
            error: '[配置] API Key is not configured',
          },
          400,
        )
      }
      const templates = await templateManager.getTemplates()
      const template = templates.find((t) => t.id === templateId)
      if (!template) {
        return c.json(
          { success: false as const, error: '[服务] Template not found' },
          404,
        )
      }
      const result = await handleImageGeneration({
        apiKey,
        ...getGptImageEndpoint(),
        template: withAspectRatioLine(template, appendAspectRatio),
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
        n: z.number().min(1).max(GPT_IMAGE_OUTPUT_MAX_N).optional().default(1),
        appendAspectRatio: z.boolean().optional(),
      }),
    ),
    async (c) => {
      const {
        prompt,
        aspectRatio,
        images,
        size,
        quality,
        n,
        appendAspectRatio,
      } = c.req.valid('json')
      const apiKey = getYunwuApiKey()
      if (!apiKey) {
        return c.json(
          {
            success: false as const,
            error: '[配置] API Key is not configured',
          },
          400,
        )
      }
      const template: TaskTemplate = {
        id: uuidv4(),
        createdAt: Date.now(),
        prompt,
        aspectRatio,
        images: images || [],
        title: TRIAL_TEMPLATE_TITLE,
        n,
      }
      const result = await handleImageGeneration({
        apiKey,
        ...getGptImageEndpoint(),
        template: withAspectRatioLine(template, appendAspectRatio),
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
            message: `[网络] ${error.message || '生成失败'}`,
            data: null,
          },
          500,
        )
      }
    },
  )

export default gptImageApi
