import fs from 'fs-extra'
import path from 'path'
import { INPUT_IMAGES_DIR } from '../../common/static'
import { GENERATED_IMAGES_API_PATH } from '../../common/static/enum'
import { taskManager } from '../../common/task-manager'
import { TaskTemplate } from '../../common/template-manager'
import { logger } from '../utils/logger'
import { GPT_IMAGE_SOURCE_MODEL, GptImageQuality, GptImageSize } from './enum'
import { calculateSize, generateGPTImage, GptImageUsage } from './generate'

export async function handleImageGeneration(options: {
  apiKey: string
  baseUrl: string
  modelId: string
  template: TaskTemplate
  size?: GptImageSize
  quality?: GptImageQuality
}) {
  try {
    const {
      apiKey,
      baseUrl,
      modelId,
      template,
      size = '1k',
      quality = 'medium',
    } = options

    // 用于错误提示的接入点域名
    let endpointHost = baseUrl
    try {
      endpointHost = new URL(baseUrl).host
    } catch {
      // baseUrl 非法时原样展示
    }

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
        data: {
          success: false as const,
          error: '[服务] Failed to create task',
        },
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
          throw new Error(
            `[服务] Template image not found on Input Dir: ${imagePath}`,
          )
        }
      }
    }

    let filenames: string[] = []
    let usage: GptImageUsage | undefined
    try {
      const res = await generateGPTImage({
        apiKey,
        baseUrl,
        modelId,
        prompt: template.prompt,
        size: finalSize,
        quality,
        imagePaths,
        n: template.n || 1,
        resolution: size,
        aspectRatio: template.aspectRatio || '1:1',
      })
      logger.info('GPT image generated successfully')
      filenames = res.filenames
      usage = res.usage
    } catch (error: any) {
      logger.error(
        `Failed to generate GPT image via ${endpointHost}`,
        error.message,
      )
      await taskManager.updateTaskStatus(task.id, 'failed', error.message)
      return {
        status: 500,
        data: {
          success: false as const,
          error: `[${endpointHost}] ${error.message}`,
        },
      }
    }

    const duration = Date.now() - startTime
    const outputUrls = filenames.map((f) => `${GENERATED_IMAGES_API_PATH}/${f}`)
    await taskManager.updateTask(task.id, {
      status: 'completed',
      duration,
      outputUrls,
      gptTokenUsage: usage,
    })

    logger.info(`GPT image task finished`)
    return {
      status: 200,
      data: { success: true as const, outputUrls, taskId: task.id },
    }
  } catch (error: any) {
    logger.error(`Failed to generate GPT image`, error.message)
    return {
      status: 500,
      data: { success: false as const, error: `[服务] ${error.message}` },
    }
  }
}
