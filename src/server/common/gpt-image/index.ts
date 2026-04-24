import { taskManager } from '../../api/common/task'
import { TaskTemplate } from '../template-manager'
import { logger } from '../../module/utils/logger'
import {
  GENERATED_IMAGES_API_PATH,
  GENERATED_IMAGES_DIR,
  INPUT_IMAGES_DIR
} from '../../api/common/static'
import fs from 'fs-extra'
import path from 'path'
import crypto from 'crypto'
import { GPT_IMAGE_SOURCE_MODEL } from './enum'
import { writeFile } from 'fs/promises'
import OpenAI, { toFile } from 'openai'

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
  images?: string[]
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
    height = Math.round(baseSize / ratio / 16) * 16
  }

  return `${width}x${height}`
}

async function generateGPTImageNew(options: GenerateGPTImageOptions) {
  const { apiKey, prompt, size, quality = 'medium', images } = options
  const client = new OpenAI({
    apiKey,
    baseURL: 'https://api.wlai.vip/v1'
  })

  const imagesToUpload = images
    ? await Promise.all(
        images.map(
          async (file) =>
            await toFile(fs.createReadStream(file), null, {
              type: 'image/png'
            })
        )
      )
    : undefined

  const res = await client.images.generate({
    model: GPT_IMAGE_SOURCE_MODEL,
    prompt,
    n: 1,
    size: size as any,
    quality
    // images: imagesToUpload
  })

  const imageBuffer = Buffer.from(res.data?.[0].b64_json || '', 'base64')

  const hash = crypto.createHash('md5').update(imageBuffer).digest('hex')
  const filename = `${hash}.png`
  const filepath = path.join(GENERATED_IMAGES_DIR, filename)
  await writeFile(filepath, imageBuffer)
  return {
    filename,
    usage: res.usage
  }
}

export async function handleImageGeneration(options: {
  apiKey: string
  template: TaskTemplate
  quality?: 'low' | 'medium' | 'high'
  size?: 1024 | 2048
}) {
  try {
    const { apiKey, template, quality = 'medium', size = 1024 } = options

    logger.info(`Generating GPT image`)

    const task = await taskManager.createTaskFromTemplate(
      template,
      GPT_IMAGE_SOURCE_MODEL
    )
    if (!task) {
      return {
        status: 500,
        data: { success: false as const, error: 'Failed to create task' }
      }
    }

    await taskManager.updateTaskStatus(task.id, 'running')
    const startTime = Date.now()

    const finalSize = calculateSize(template.aspectRatio || '1:1', size)

    let base64Images: string[] = []
    if (template.images && template.images.length > 0) {
      for (const imgUrl of template.images) {
        try {
          const filename = imgUrl.split('/').pop()
          if (filename) {
            let filepath = ''
            if (imgUrl.includes('/images/generated/')) {
              filepath = path.join(GENERATED_IMAGES_DIR, filename)
            } else if (imgUrl.includes('/images/input/')) {
              filepath = path.join(INPUT_IMAGES_DIR, filename)
            } else {
              // fallback
              filepath = path.join(INPUT_IMAGES_DIR, filename)
            }

            if (await fs.pathExists(filepath)) {
              const buffer = await fs.readFile(filepath)
              const ext = path.extname(filename).slice(1)
              let mimeType = ext === 'jpg' ? 'jpeg' : ext
              if (ext === 'webp') mimeType = 'webp'
              base64Images.push(
                `data:image/${mimeType};base64,${buffer.toString('base64')}`
              )
            } else {
              logger.error(`Template image not found on disk: ${filepath}`)
            }
          }
        } catch (e) {
          logger.error('Failed to read template image', e)
        }
      }
    }

    let filename: string
    let usage: GPTImageResponse['usage'] | undefined
    try {
      const res = await generateGPTImageNew({
        apiKey,
        prompt: template.prompt,
        size: finalSize,
        quality,
        images: base64Images.length > 0 ? base64Images : undefined
      })
      logger.info('GPT image generated successfully')
      filename = res.filename
      usage = res.usage
    } catch (error: any) {
      logger.error(`Failed to generate GPT image`, error.message)
      await taskManager.updateTaskStatus(task.id, 'failed', error.message)
      return {
        status: 500,
        data: { success: false as const, error: error.message }
      }
    }

    const duration = Date.now() - startTime
    const outputUrl = `${GENERATED_IMAGES_API_PATH}/${filename}`
    await taskManager.updateTask(task.id, {
      status: 'completed',
      duration,
      outputUrl,
      gptTokenUsage: usage
    })

    logger.info(`GPT image task finished`)
    return {
      status: 200,
      data: { success: true as const, image: filename, taskId: task.id }
    }
  } catch (error: any) {
    logger.error(`Failed to generate GPT image`, error.message)
    return {
      status: 500,
      data: { success: false as const, error: error.message }
    }
  }
}
