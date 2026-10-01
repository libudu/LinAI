import { zValidator } from '@hono/zod-validator'
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { importComfyWorkflow } from '../../module/gpt-image/comfyui-workflow'
import { GPT_IMAGE_OUTPUT_MAX_N } from '../../module/gpt-image/enum'
import { ImageSubmissionError } from '../../module/gpt-image/errors'
import { submitImageGeneration } from '../../module/gpt-image/service'
import gptImageEndpointApi from './endpoint'

const imageInputFields = {
  prompt: z.string().min(1, 'Prompt is required'),
  images: z.array(z.string()).optional().default([]),
  aspectRatio: z.string().optional(),
  n: z.number().int().min(1).max(GPT_IMAGE_OUTPUT_MAX_N).optional(),
}

const generationOptionFields = {
  size: z.enum(['1k', '2k', '4k']).optional().default('1k'),
  quality: z
    .enum(['medium', 'high', 'xhigh', 'max'])
    .optional()
    .default('medium'),
  appendAspectRatio: z.boolean().optional(),
}

async function submissionResponse(
  c: Context,
  options: Parameters<typeof submitImageGeneration>[0],
) {
  try {
    return c.json({
      success: true as const,
      ...(await submitImageGeneration(options)),
    })
  } catch (error) {
    if (!(error instanceof ImageSubmissionError)) throw error
    return c.json(
      { success: false as const, error: error.message },
      error.status,
    )
  }
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
        if (!(error instanceof ImageSubmissionError)) throw error
        return c.json(
          {
            success: false as const,
            error: error instanceof Error ? error.message : String(error),
          },
          error.status,
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
        mode: z.enum(['generate', 'trial']).optional().default('generate'),
        input: z.object({
          title: z.string().optional(),
          ...imageInputFields,
        }),
        ...generationOptionFields,
        endpointId: z.string().optional(),
      }),
    ),
    async (c) => {
      return submissionResponse(c, c.req.valid('json'))
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
        endpointId: z.string().optional(),
      }),
    ),
    async (c) => {
      const { size, quality, appendAspectRatio, endpointId, ...input } =
        c.req.valid('json')
      return submissionResponse(c, {
        mode: 'trial',
        input,
        size,
        quality,
        appendAspectRatio,
        endpointId,
      })
    },
  )

export default gptImageApi
