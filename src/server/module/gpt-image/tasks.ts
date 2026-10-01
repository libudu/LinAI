import {
  COMFY_IMAGE_SOURCE,
  GPT_IMAGE_SOURCE_MODEL,
} from '@/shared/image/sources'
import { logger } from '../../common/logger'
import { taskService, type Task } from '../../common/task'
import { deleteUnreferencedImages } from './assets'
import { cancelComfyTaskForDeletion } from './comfyui'
import { cancelCloudTaskForDeletion } from './index'

export class ImageTaskCancellationError extends Error {}

export const getImageTasks = () => taskService.getTasks()

/** 生图任务删除：先取消执行，再原子删除记录，最后按最新引用清理输出。 */
export async function deleteImageTask(id: string, keepImage: boolean) {
  const task = (await taskService.getTasks()).find((item) => item.id === id)
  if (!task) return false
  const cancelling =
    (task.source === COMFY_IMAGE_SOURCE ||
      task.source === GPT_IMAGE_SOURCE_MODEL) &&
    (task.status === 'pending' || task.status === 'running')
  if (cancelling) {
    try {
      if (task.source === COMFY_IMAGE_SOURCE)
        await cancelComfyTaskForDeletion(task)
      else await cancelCloudTaskForDeletion(task.id)
    } catch (error) {
      throw new ImageTaskCancellationError(
        error instanceof Error ? error.message : '取消生图任务失败',
      )
    }
  }
  let removed: Task | null
  try {
    removed = await taskService.removeTask(id)
  } catch (error) {
    if (cancelling) {
      await taskService
        .updateActiveTask(id, {
          status: 'failed',
          error: '[服务] 生成已取消，但删除任务记录失败',
        })
        .catch((failure) => logger.error('取消后任务状态保存失败', failure))
    }
    throw error
  }
  if (!removed) return false
  if (!keepImage) {
    const urls = removed.outputUrls?.length
      ? removed.outputUrls
      : removed.outputUrl
        ? [removed.outputUrl]
        : []
    if (urls.length) {
      await deleteUnreferencedImages({ type: 'generated', urls }).catch(
        (error) => logger.error('任务输出图片清理失败', error),
      )
    }
  }
  return true
}
