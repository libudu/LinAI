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

export async function generateGPTImage(
  options: GenerateGPTImageOptions
): Promise<{ url: string; usage?: GPTImageResponse['usage'] }> {
  const { apiKey, prompt, size, quality = 'medium', images } = options

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
      quality: quality,
      image: images || []
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
      'gpt-image-2'
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

    let imageUrl: string
    let gptTokenUsage: GPTImageResponse['usage'] | undefined
    try {
      const res = await generateGPTImage({
        apiKey,
        prompt: template.prompt,
        size: finalSize,
        quality,
        images: base64Images.length > 0 ? base64Images : undefined
      })
      logger.info('GPT image generated successfully', JSON.stringify(res))
      imageUrl = res.url
      gptTokenUsage = res.usage
    } catch (err: any) {
      logger.error(`Failed to generate GPT image`, err.message)
      await taskManager.updateTaskStatus(task.id, 'failed', err.message)
      return {
        status: 500,
        data: { success: false as const, error: err.message }
      }
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
      const filepath = path.join(GENERATED_IMAGES_DIR, filename)

      await fs.writeFile(filepath, buffer)
      imageUrl = `${GENERATED_IMAGES_API_PATH}/${filename}`
    } catch (e) {
      logger.error('Failed to save generated image locally', e)
    }

    const duration = Date.now() - startTime
    await taskManager.updateTask(task.id, {
      status: 'completed',
      duration,
      outputUrl: imageUrl,
      gptTokenUsage
    })

    logger.info(`GPT image generated successfully`)
    return {
      status: 200,
      data: { success: true as const, image: imageUrl, taskId: task.id }
    }
  } catch (error: any) {
    logger.error(`Failed to generate GPT image`, error.message)
    return {
      status: 500,
      data: { success: false as const, error: error.message }
    }
  }
}
