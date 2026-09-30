import { TRIAL_TEMPLATE_TITLE } from '@/shared/image/template'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { StorageError } from '../../common/storage/errors'
import { importComfyWorkflow } from '../../module/gpt-image/comfyui-workflow'
import { GPT_IMAGE_OUTPUT_MAX_N } from '../../module/gpt-image/enum'
import { submitImageGeneration } from '../../module/gpt-image/service'
import gptImageEndpointApi from './endpoint'

const imageInputFields = {
  prompt: z.string().min(1, 'Prompt is required'),
  images: z.array(z.string()).optional().default([]),
  aspectRatio: z.string().optional(),
  n: z.number().min(1).max(GPT_IMAGE_OUTPUT_MAX_N).optional(),
}

const generationOptionFields = {
  size: z.enum(['1k', '2k', '4k']).optional().default('1k'),
  quality: z
    .enum(['medium', 'high', 'xhigh', 'max'])
    .optional()
    .default('medium'),
  appendAspectRatio: z.boolean().optional(),
}

const gptImageApi = new Hono()
  // 接入点相关（余额查询等）
  .route('/endpoint', gptImageEndpointApi)
  .post(
    '/comfyui/import',
    zValidator(
      'json',
      z.object({
        endpointId: z.string().optional(),
        title: z.string().min(1),
        baseUrl: z.string().min(1),
        workflowName: z.string(),
        content: z
          .string()
          .min(1)
          .max(10 * 1024 * 1024),
      }),
    ),
    async (c) => {
      try {
        const endpoint = await importComfyWorkflow(c.req.valid('json'))
        return c.json({ success: true as const, endpoint })
      } catch (error) {
        if (error instanceof StorageError) throw error
        return c.json(
          {
            success: false as const,
            error: error instanceof Error ? error.message : String(error),
          },
          400,
        )
      }
    },
  )
  // 模块配置走注册式设置接口：GET/PUT /api/settings/gpt-image
  .post(
    '/generate',
    zValidator(
      'json',
      z.object({
        // 前端提交一次生成所需的完整模板快照，后端不再依赖模板存储
        input: z.object({
          title: z.string().optional(),
          ...imageInputFields,
        }),
        ...generationOptionFields,
        endpointId: z.string().optional(),
      }),
    ),
    async (c) => {
      const result = await submitImageGeneration(c.req.valid('json'))
      return c.json(result.data, result.status)
    },
  )
  .post(
    '/trial',
    zValidator(
      'json',
      z.object({
        ...imageInputFields,
        ...generationOptionFields,
        aspectRatio: imageInputFields.aspectRatio.default('1:1'),
        n: imageInputFields.n.default(1),
      }),
    ),
    async (c) => {
      const { size, quality, appendAspectRatio, ...input } = c.req.valid('json')
      const result = await submitImageGeneration({
        input: { ...input, title: TRIAL_TEMPLATE_TITLE },
        size,
        quality,
        appendAspectRatio,
      })
      return c.json(result.data, result.status)
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
