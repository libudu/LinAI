import { taskManager } from '../../api/common/task'
import { TaskTemplate } from '../../common/template-manager'
import { logger } from '../utils/logger'
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
  imagePaths: string[]
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
  const { apiKey, prompt, size, imagePaths: images } = options
  const client = new OpenAI({
    apiKey,
    baseURL: 'https://api.wlai.vip/v1'
  })
  const imagesToUpload = images.length
    ? await Promise.all(
        images.map(
          async (file) =>
            await toFile(fs.createReadStream(file), null, {
              type: 'image/png'
            })
        )
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
      quality: 'medium'
    })
  } else {
    res = await client.images.generate({
      model: GPT_IMAGE_SOURCE_MODEL,
      prompt,
      n: 1,
      size: size as any,
      quality: 'medium'
    })
  }

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
  size?: 1024 | 2048
}) {
  try {
    const { apiKey, template, size = 1024 } = options

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
        imagePaths
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
