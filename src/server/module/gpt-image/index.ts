import type { GptImageQuality, GptImageSize } from '@/shared/image/params'
import { GPT_IMAGE_SOURCE_MODEL } from '@/shared/image/sources'
import type { TaskInputSnapshot } from '@/shared/image/template'
import fs from 'fs-extra'
import path from 'path'
import { logger } from '../../common/logger'
import { INPUT_IMAGES_DIR } from '../../common/static'
import { GENERATED_IMAGES_API_PATH } from '../../common/static/enum'
import { StorageError } from '../../common/storage/errors'
import { taskService } from '../../common/task'
import { calculateSize, generateGPTImage } from './generate'

export async function handleImageGeneration(options: {
  apiKey: string
  baseUrl: string
  modelId: string
  snapshot: TaskInputSnapshot
  size?: GptImageSize
  quality?: GptImageQuality
}) {
  let taskId: string | undefined
  let errorPrefix = '[服务]'
  try {
    const {
      apiKey,
      baseUrl,
      modelId,
      snapshot,
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

    // 输入校验先于任务创建，避免缺失参考图留下无法结束的 running 任务。
    const finalSize = calculateSize(snapshot.aspectRatio || '1:1', size)
    const imagePaths: string[] = []
    for (const imgUrl of snapshot.images) {
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

    logger.info('Generating GPT image')
    const task = await taskService.createTaskFromSnapshot({
      snapshot,
      source: GPT_IMAGE_SOURCE_MODEL,
      size,
      quality,
    })
    taskId = task.id
    await taskService.updateTaskStatus(taskId, 'running')
    const startTime = Date.now()

    errorPrefix = `[${endpointHost}]`
    const { filenames, usage } = await generateGPTImage({
      apiKey,
      baseUrl,
      modelId,
      prompt: snapshot.prompt,
      size: finalSize,
      quality,
      imagePaths,
      n: snapshot.n || 1,
      resolution: size,
      aspectRatio: snapshot.aspectRatio || '1:1',
    })
    logger.info('GPT image generated successfully')

    const duration = Date.now() - startTime
    const outputUrls = filenames.map((f) => `${GENERATED_IMAGES_API_PATH}/${f}`)
    await taskService.updateTask(taskId, {
      status: 'completed',
      duration,
      outputUrls,
      gptTokenUsage: usage,
    })

    logger.info(`GPT image task finished`)
    return {
      status: 200 as const,
      data: { success: true as const, outputUrls, taskId },
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    // 创建后的整个执行流程共用失败收尾；已删除或结束的任务不会被重新写入。
    if (taskId) {
      await taskService.updateActiveTask(taskId, {
        status: 'failed',
        error: reason,
      })
    }
    // 存储错误仍交给全局 onError；失败状态写盘失败也会直接向上抛出。
    if (error instanceof StorageError) throw error
    logger.error(`Failed to generate GPT image ${errorPrefix}`, reason)
    return {
      status: 500 as const,
      data: { success: false as const, error: `${errorPrefix} ${reason}` },
    }
  }
}
