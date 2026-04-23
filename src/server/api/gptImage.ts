import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { taskManager } from './common/task'
import { templateManager } from './common/template'
import { logger } from '../module/utils/logger'
import fs from 'fs-extra'
import path from 'path'
import crypto from 'crypto'

const tempImagesDir = path.join(process.cwd(), 'data', 'temp_images')
if (!fs.existsSync(tempImagesDir)) {
  fs.mkdirSync(tempImagesDir, { recursive: true })
}

interface GPTImageResponse {
  created: number
  data: Array<{
    url?: string
    b64_json?: string
  }>
  usage?: {
    total_tokens: number
    input_tokens: number
    output_tokens: number
    input_tokens_details?: {
      text_tokens: number
      image_tokens: number
    }
  }
}

interface GenerateGPTImageOptions {
  apiKey: string
  prompt: string
  size: string
  quality?: 'low' | 'medium' | 'high'
}

function calculateSize(aspectRatio: string, baseSize: 1024 | 2048): string {
  const [wStr, hStr] = aspectRatio.split(':')
  const wRatio = parseInt(wStr, 10)
  const hRatio = parseInt(hStr, 10)

  if (isNaN(wRatio) || isNaN(hRatio) || hRatio === 0) {
    return `${baseSize}x${baseSize}`
  }

  const ratio = wRatio / hRatio
  let width: number
  let height: number

  if (ratio >= 1) {
    height = baseSize
    width = Math.round((baseSize * ratio) / 16) * 16
  } else {
    width = baseSize
    height = Math.round((baseSize / ratio) / 16) * 16
  }

  return `${width}x${height}`
}

async function generateGPTImage(
  options: GenerateGPTImageOptions
): Promise<{ url: string; usage?: GPTImageResponse['usage'] }> {
  const { apiKey, prompt, size, quality = 'medium' } = options

  const response = await fetch('https://ai.t8star.cn/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-image-2',
      prompt: prompt,
      size: size,
      quality: quality
    })
  })

  if (!response.ok) {
    const errorData = await response.text()
    throw new Error(`API error: ${response.status} ${errorData}`)
  }

  const data = (await response.json()) as GPTImageResponse
  const imageResult = data.data?.[0]
  if (!imageResult || (!imageResult.url && !imageResult.b64_json)) {
    throw new Error('No image returned from API')
  }

  let finalUrl = ''
  if (imageResult.b64_json) {
    finalUrl = `data:image/png;base64,${imageResult.b64_json.trim()}`
  } else {
    finalUrl = imageResult.url!.replace(/`/g, '').trim()
  }

  return { url: finalUrl, usage: data.usage }
}

async function handleImageGeneration(
  options: {
    apiKey: string
    templateId?: string
    prompt?: string
    aspectRatio?: string
    quality?: 'low' | 'medium' | 'high'
    isTrial?: boolean
  }
) {
  try {
    const { apiKey, templateId, prompt, aspectRatio, quality = 'medium', isTrial } = options

    let templateInput: string | any;
    let finalPrompt = prompt;
    let finalAspectRatio = aspectRatio || '1:1';

    if (templateId) {
      const templates = await templateManager.getTemplates()
      const template = templates.find((t) => t.id === templateId)
      if (!template) {
        return { status: 404, data: { success: false as const, error: 'Template not found' } }
      }
      templateInput = templateId;
      finalPrompt = template.prompt;
      finalAspectRatio = template.aspectRatio || '1:1';
      logger.info('Generating GPT image for template ' + templateId)
    } else if (prompt) {
      templateInput = {
        prompt,
        aspectRatio: finalAspectRatio,
        usageType: 'image',
        images: [],
        title: 'Trial Template'
      }
      logger.info('Generating GPT trial image for prompt')
    } else {
      return { status: 400, data: { success: false as const, error: 'Missing templateId or prompt' } }
    }

    const task = await taskManager.createTaskFromTemplate(templateInput, 'gpt-image-2')
    if (!task) {
      return { status: 500, data: { success: false as const, error: 'Failed to create task' } }
    }

    await taskManager.updateTaskStatus(task.id, 'running')
    const startTime = Date.now()

    const finalSize = calculateSize(finalAspectRatio, isTrial ? 1024 : 2048)

    let imageUrl: string
    let gptTokenUsage: GPTImageResponse['usage'] | undefined
    try {
      const res = await generateGPTImage({
        apiKey,
        prompt: finalPrompt!,
        size: finalSize,
        quality
      })
      imageUrl = res.url
      gptTokenUsage = res.usage
    } catch (err: any) {
      logger.error(`Failed to generate GPT ${isTrial ? 'trial ' : ''}image`, err.message)
      await taskManager.updateTaskStatus(task.id, 'failed', err.message)
      return { status: 500, data: { success: false as const, error: err.message } }
    }

    if (isTrial) {
      try {
        let buffer: Buffer
        if (imageUrl.startsWith('data:image/')) {
          const b64Data = imageUrl.split(',')[1]
          buffer = Buffer.from(b64Data, 'base64')
        } else {
          const imgRes = await fetch(imageUrl)
          if (!imgRes.ok) throw new Error('Failed to download image')
          const arrayBuffer = await imgRes.arrayBuffer()
          buffer = Buffer.from(arrayBuffer)
        }

        const hash = crypto.createHash('md5').update(buffer).digest('hex')
        const filename = `${hash}.png`
        const filepath = path.join(tempImagesDir, filename)

        await fs.writeFile(filepath, buffer)
        imageUrl = `/api/static/temp/${filename}`
      } catch (e) {
        logger.error('Failed to save trial image locally', e)
      }
    }

    const duration = Date.now() - startTime
    await taskManager.updateTask(task.id, {
      status: 'completed',
      duration,
      outputUrl: imageUrl,
      gptTokenUsage
    })

    logger.info(`GPT ${isTrial ? 'trial ' : ''}image generated successfully`)
    return { status: 200, data: { success: true as const, image: imageUrl, taskId: task.id } }
  } catch (error: any) {
    logger.error(`Failed to generate GPT ${options.isTrial ? 'trial ' : ''}image`, error.message)
    return { status: 500, data: { success: false as const, error: error.message } }
  }
}

const gptImageApi = new Hono()
  .post(
    '/generate',
    zValidator(
      'json',
      z.object({
        apiKey: z.string().min(1, 'API Key is required'),
        templateId: z.string().min(1, 'Template ID is required'),
        quality: z.enum(['low', 'medium', 'high']).optional().default('medium')
      })
    ),
    async (c) => {
      const { apiKey, templateId, quality } = c.req.valid('json')
      const result = await handleImageGeneration({ apiKey, templateId, quality, isTrial: false })
      return c.json(result.data, result.status as any)
    }
  )
  .post(
    '/trial',
    zValidator(
      'json',
      z.object({
        apiKey: z.string().min(1, 'API Key is required'),
        prompt: z.string().min(1, 'Prompt is required'),
        aspectRatio: z.string().optional().default('1:1')
      })
    ),
    async (c) => {
      const { apiKey, prompt, aspectRatio } = c.req.valid('json')
      const result = await handleImageGeneration({ apiKey, prompt, aspectRatio, quality: 'low', isTrial: true })
      return c.json(result.data, result.status as any)
    }
  )

export default gptImageApi
