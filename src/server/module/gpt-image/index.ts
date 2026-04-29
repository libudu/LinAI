import crypto from 'crypto'
import fs from 'fs-extra'
import { writeFile } from 'fs/promises'
import OpenAI, { toFile } from 'openai'
import path from 'path'
import {
  GENERATED_IMAGES_API_PATH,
  GENERATED_IMAGES_DIR,
  INPUT_IMAGES_DIR,
} from '../../api/common/static'
import { taskManager } from '../../api/common/task'
import { TaskTemplate } from '../../common/template-manager'
import { logger } from '../utils/logger'
import { GPT_IMAGE_SOURCE_MODEL, GptImageQuality, GptImageSize } from './enum'

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
  quality: GptImageQuality
  imagePaths: string[]
}

function calculateSize(aspectRatio: string, baseSize: GptImageSize): string {
  const [wStr, hStr] = aspectRatio.split(':')
  const wRatio = parseInt(wStr, 10)
  const hRatio = parseInt(hStr, 10)

  let targetSize: number
  if (baseSize === '1k') targetSize = 1024
  else if (baseSize === '2k') targetSize = 2048
  else if (baseSize === '4k') targetSize = 3840
  else targetSize = 1024

  let width: number
  let height: number

  if (isNaN(wRatio) || isNaN(hRatio) || hRatio === 0) {
    width = targetSize
    height = targetSize
  } else {
    const ratio = wRatio / hRatio
    if (baseSize === '1k') {
      // 1k: 保留短边 1024
      if (ratio >= 1) {
        height = targetSize
        width = Math.round((targetSize * ratio) / 16) * 16
      } else {
        width = targetSize
        height = Math.round(targetSize / ratio / 16) * 16
      }
    } else {
      // 2k 和 4k: 保留长边 2048 / 3840
      if (ratio >= 1) {
        width = targetSize
        height = Math.round(targetSize / ratio / 16) * 16
      } else {
        height = targetSize
        width = Math.round((targetSize * ratio) / 16) * 16
      }
    }
  }

  const MAX_PIXELS = 8294400
  if (width * height > MAX_PIXELS) {
    const scale = Math.sqrt(MAX_PIXELS / (width * height))
    width = Math.floor((width * scale) / 16) * 16
    height = Math.floor((height * scale) / 16) * 16

    if (width === 0) width = 16
    if (height === 0) height = 16
  }

  return `${width}x${height}`
}

async function generateGPTImageNew(options: GenerateGPTImageOptions) {
  const { apiKey, prompt, size, quality, imagePaths: images } = options
  const client = new OpenAI({
    apiKey,
    baseURL: 'https://api.wlai.vip/v1',
  })
  const imagesToUpload = images.length
    ? await Promise.all(
        images.map(
          async (file) =>
            await toFile(fs.createReadStream(file), null, {
              type: 'image/png',
            }),
        ),
      )
    : undefined

  let res: OpenAI.Images.ImagesResponse
  if (imagesToUpload) {
    res = await client.images.edit({
      model: GPT_IMAGE_SOURCE_MODEL,
      image: imagesToUpload || [],
      prompt: prompt,
      n: 1,
      size: size as any,
      quality,
    })
  } else {
    res = await client.images.generate({
      model: GPT_IMAGE_SOURCE_MODEL,
      prompt,
      n: 1,
      size: size as any,
      quality,
    })
  }

  const imageBuffer = Buffer.from(res.data?.[0].b64_json || '', 'base64')

  const hash = crypto.createHash('md5').update(imageBuffer).digest('hex')
  const filename = `${hash}.png`
  const filepath = path.join(GENERATED_IMAGES_DIR, filename)
  await writeFile(filepath, imageBuffer)
  return {
    filename,
    usage: res.usage,
  }
}

export async function handleImageGeneration(options: {
  apiKey: string
  template: TaskTemplate
  size?: GptImageSize
  quality?: GptImageQuality
}) {
  try {
    const { apiKey, template, size = '1k', quality = 'medium' } = options

    logger.info(`Generating GPT image`)

    const task = await taskManager.createTaskFromTemplate({
      template,
      source: GPT_IMAGE_SOURCE_MODEL,
      size,
      quality,
    })

    if (!task) {
      return {
        status: 500,
        data: { success: false as const, error: 'Failed to create task' },
      }
    }

    await taskManager.updateTaskStatus(task.id, 'running')
    const startTime = Date.now()

    const finalSize = calculateSize(template.aspectRatio || '1:1', size)

    const imagePaths: string[] = []
    for (const imgUrl of template.images) {
      const filename = imgUrl.split('/').pop()
      if (filename) {
        const imagePath = path.join(INPUT_IMAGES_DIR, filename)
        if (await fs.pathExists(imagePath)) {
          imagePaths.push(imagePath)
        } else {
          throw new Error(`Template image not found on Input Dir: ${imagePath}`)
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
        imagePaths,
      })
      logger.info('GPT image generated successfully')
      filename = res.filename
      usage = res.usage
    } catch (error: any) {
      logger.error(`Failed to generate GPT image`, error.message)
      await taskManager.updateTaskStatus(task.id, 'failed', error.message)
      return {
        status: 500,
        data: { success: false as const, error: error.message },
      }
    }

    const duration = Date.now() - startTime
    const outputUrl = `${GENERATED_IMAGES_API_PATH}/${filename}`
    await taskManager.updateTask(task.id, {
      status: 'completed',
      duration,
      outputUrl,
      gptTokenUsage: usage,
    })

    logger.info(`GPT image task finished`)
    return {
      status: 200,
      data: { success: true as const, outputUrl, taskId: task.id },
    }
  } catch (error: any) {
    logger.error(`Failed to generate GPT image`, error.message)
    return {
      status: 500,
      data: { success: false as const, error: error.message },
    }
  }
}
