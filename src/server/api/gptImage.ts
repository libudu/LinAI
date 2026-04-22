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
    url: string
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

async function generateGPTImage(
  apiKey: string,
  prompt: string
): Promise<string> {
  const response = await fetch('https://ai.t8star.cn/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-image-2',
      prompt: prompt
    })
  })

  if (!response.ok) {
    const errorData = await response.text()
    throw new Error(`API error: ${response.status} ${errorData}`)
  }

  const data = (await response.json()) as GPTImageResponse
  const imageResult = data.data?.[0]
  if (!imageResult || !imageResult.url) {
    throw new Error('No image returned from API')
  }

  return imageResult.url.replace(/`/g, '').trim()
}

const gptImageApi = new Hono()
  .get(
    '/temp/:filename',
    zValidator('param', z.object({ filename: z.string() })),
    async (c) => {
      const { filename } = c.req.valid('param')
      const filepath = path.join(tempImagesDir, filename)
      if (fs.existsSync(filepath)) {
        const file = await fs.readFile(filepath)
        const ext = path.extname(filename).slice(1)
        let mimeType = ext === 'jpg' ? 'jpeg' : ext
        if (ext === 'webp') mimeType = 'webp'
        c.header('Content-Type', `image/${mimeType}`)
        return c.body(file)
      }
      return c.notFound()
    }
  )
  .post(
    '/generate',
    zValidator(
      'json',
      z.object({
        apiKey: z.string().min(1, 'API Key is required'),
        templateId: z.string().min(1, 'Template ID is required')
      })
    ),
    async (c) => {
      try {
        const { apiKey, templateId } = c.req.valid('json')

        const templates = await templateManager.getTemplates()
        const template = templates.find((t) => t.id === templateId)

        if (!template) {
          return c.json({ success: false, error: 'Template not found' }, 404)
        }

        logger.info('Generating GPT image for template ' + templateId)

        let imageUrl: string
        try {
          imageUrl = await generateGPTImage(apiKey, template.prompt)
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
          imageUrl = await generateGPTImage(apiKey, prompt)
        } catch (err: any) {
          logger.error('Failed to generate GPT trial image', err.message)
          return c.json({ success: false as const, error: err.message }, 500)
        }

        try {
          const imgRes = await fetch(imageUrl)
          if (!imgRes.ok) throw new Error('Failed to download image')
          const arrayBuffer = await imgRes.arrayBuffer()
          const buffer = Buffer.from(arrayBuffer)

          const hash = crypto.createHash('md5').update(buffer).digest('hex')
          const filename = `${hash}.png`
          const filepath = path.join(tempImagesDir, filename)

          await fs.writeFile(filepath, buffer)
          imageUrl = `/api/gptImage/temp/${filename}`
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
