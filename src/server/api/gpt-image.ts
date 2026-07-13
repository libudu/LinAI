import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { v4 as uuidv4 } from 'uuid'
import { TaskTemplate, templateManager } from '../common/template-manager'
import { TRIAL_TEMPLATE_TITLE } from '../common/template-manager/enum'
import { handleImageGeneration } from '../module/gpt-image'
import { GPT_IMAGE_OUTPUT_MAX_N } from '../module/gpt-image/enum'
import { GPT_IMAGE_SOURCE_MODEL } from '../module/gpt-image/enum'
import { taskManager } from '../common/task-manager'
import { handleImageEdit } from '../module/gpt-image/edit'
import { GENERATED_IMAGES_API_PATH } from '../common/static/enum'
import { z } from 'zod'
import { getYunwuApiKey } from '../common/config'
import { Logger } from '../module/utils/logger'

const editLogger = new Logger('gpt-image-edit')
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
    const apiKey = getYunwuApiKey()
    if (!apiKey) {
      return c.json(
        { success: false as const, error: '[配置] API Key is not configured' },
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
            error: `[yunwu.ai] ${data?.message || '获取余额失败'}`,
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
        { success: false as const, error: `[网络] ${error.message || '获取余额失败'}` },
        500,
      )
    }
  })
  .post(
    '/edit',
    zValidator(
      'json',
      z.object({
        image: z.string().min(1, 'Image is required'),
        mask: z.string().optional(),
        prompt: z.string().min(1, 'Prompt is required'),
        n: z
          .number()
          .min(1)
          .max(4)
          .optional()
          .default(1),
        quality: z
          .enum(['standard', 'low', 'medium', 'high', 'auto'])
          .optional()
          .default('auto'),
      }),
    ),
    async (c) => {
      const { image, mask, prompt, n, quality } = c.req.valid('json')
      const apiKey = getYunwuApiKey()
      if (!apiKey) {
        return c.json(
          { success: false as const, error: '[配置] API Key is not configured' },
          400,
        )
      }

      // Create a pseudo-template to track the edit task
      const editTemplate: TaskTemplate = {
        id: uuidv4(),
        title: '图片编辑',
        prompt,
        images: [],
        createdAt: Date.now(),
      }

      const task = await taskManager.createTaskFromTemplate({
        template: editTemplate,
        source: GPT_IMAGE_SOURCE_MODEL,
      })
      if (!task) {
        return c.json(
          { success: false as const, error: '[服务] Failed to create task' },
          500,
        )
      }

      await taskManager.updateTaskStatus(task.id, 'running')
      await taskManager.updateTask(task.id, { taskType: 'edit' })
      const taskId = task.id
      const startTime = Date.now()

      // Return immediately — process in background
      ;(async () => {
        try {
          editLogger.info(`Edit generation started — task=${taskId} prompt="${prompt.slice(0, 40)}${prompt.length > 40 ? '...' : ''}"`)
          const result = await handleImageEdit({
            apiKey,
            baseURL: 'https://api.wlai.vip/v1',
            imageBase64: image,
            maskBase64: mask,
            prompt,
            n,
            quality,
          })
          const duration = Date.now() - startTime
          const outputUrls = result.filenames.map(
            (f) => `${GENERATED_IMAGES_API_PATH}/${f}`,
          )
          editLogger.info(`Edit generation completed — task=${taskId} files=${result.filenames.length} duration=${duration}ms`)
          await taskManager.updateTask(taskId, {
            status: 'completed',
            duration,
            outputUrls,
          })
        } catch (error: any) {
          editLogger.error(`Edit generation failed — task=${taskId} error=${error.message}`)
          await taskManager.updateTaskStatus(taskId, 'failed', `[api.wlai.vip] ${error.message}`)
        }
      })()

      return c.json({
        success: true as const,
        taskId,
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
      }),
    ),
    async (c) => {
      const { templateId, size, quality } = c.req.valid('json')
      const apiKey = getYunwuApiKey()
      if (!apiKey) {
        return c.json(
          { success: false as const, error: '[配置] API Key is not configured' },
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
        n: z.number().min(1).max(GPT_IMAGE_OUTPUT_MAX_N).optional().default(1),
      }),
    ),
    async (c) => {
      const { prompt, aspectRatio, images, size, quality, n } =
        c.req.valid('json')
      const apiKey = getYunwuApiKey()
      if (!apiKey) {
        return c.json(
          { success: false as const, error: '[配置] API Key is not configured' },
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
            message: `[网络] ${error.message || '生成失败'}`,
            data: null,
          },
          500,
        )
      }
    },
  )

export default gptImageApi
