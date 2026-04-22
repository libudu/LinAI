import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { templateManager } from './template'
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
  size?: '1k' | '2k'
  quality?: 'low' | 'medium' | 'high'
}

async function generateGPTImage(
  options: GenerateGPTImageOptions
): Promise<string> {
  const { apiKey, prompt, size = '1k', quality = 'medium' } = options

  const response = await fetch('https://ai.t8star.cn/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-image-2',
      prompt: prompt,
      size: size === '2k' ? '2048x2048' : '1024x1024',
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

  if (imageResult.b64_json) {
    return `data:image/png;base64,${imageResult.b64_json.trim()}`
  }

  return imageResult.url!.replace(/`/g, '').trim()
}

const gptImageApi = new Hono()
  .post(
    '/generate',
    zValidator(
      'json',
      z.object({
        apiKey: z.string().min(1, 'API Key is required'),
        templateId: z.string().min(1, 'Template ID is required'),
        size: z.enum(['1k', '2k']).optional().default('1k'),
        quality: z.enum(['low', 'medium', 'high']).optional().default('medium')
      })
    ),
    async (c) => {
      try {
        const { apiKey, templateId, size, quality } = c.req.valid('json')

        const templates = await templateManager.getTemplates()
        const template = templates.find((t) => t.id === templateId)

        if (!template) {
          return c.json({ success: false, error: 'Template not found' }, 404)
        }

        logger.info('Generating GPT image for template ' + templateId)

        let imageUrl: string
        try {
          imageUrl = await generateGPTImage({
            apiKey,
            prompt: template.prompt,
            size,
            quality
          })
        } catch (err: any) {
          logger.error('Failed to generate GPT image', err.message)
          return c.json({ success: false, error: err.message }, 500)
        }

        logger.info('GPT image generated successfully')
        return c.json({ success: true, image: imageUrl })
      } catch (error: any) {
        logger.error('Failed to generate GPT image', error.message)
        return c.json({ success: false, error: error.message }, 500)
      }
    }
  )
  .post(
    '/trial',
    zValidator(
      'json',
      z.object({
        apiKey: z.string().min(1, 'API Key is required'),
        prompt: z.string().min(1, 'Prompt is required')
      })
    ),
    async (c) => {
      try {
        const { apiKey, prompt } = c.req.valid('json')

        logger.info('Generating GPT trial image for prompt')

        let imageUrl: string
        try {
          imageUrl = await generateGPTImage({
            apiKey,
            prompt,
            quality: 'low'
          })
        } catch (err: any) {
          logger.error('Failed to generate GPT trial image', err.message)
          return c.json({ success: false as const, error: err.message }, 500)
        }

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

        logger.info('GPT trial image generated successfully')
        return c.json({ success: true as const, image: imageUrl })
      } catch (error: any) {
        logger.error('Failed to generate GPT trial image', error.message)
        return c.json({ success: false as const, error: error.message }, 500)
      }
    }
  )

export default gptImageApi
