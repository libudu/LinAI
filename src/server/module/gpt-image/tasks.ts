import {
  COMFY_IMAGE_SOURCE,
  GPT_IMAGE_SOURCE_MODEL,
} from '@/shared/image/sources'
import { TRIAL_TEMPLATE_TITLE } from '@/shared/image/template'
import { logger } from '../../common/logger'
import { taskService, type Task } from '../../common/task'
import { deleteUnreferencedImages } from './assets'
import { cancelComfyTaskForDeletion } from './comfyui'
import { cancelCloudTaskForDeletion } from './index'

export class ImageTaskCancellationError extends Error {}

export const getImageTasks = async () =>
  (await taskService.getTasks()).map((task) => ({
    ...task,
    mode:
      task.mode ??
      (task.inputSnapshot?.title === TRIAL_TEMPLATE_TITLE
        ? ('trial' as const)
        : ('generate' as const)),
  }))

const imageTasks = async () =>
  (await getImageTasks()).filter(
    (task) =>
      task.source === GPT_IMAGE_SOURCE_MODEL ||
      task.source === COMFY_IMAGE_SOURCE,
  )

export async function getImageTaskSummary() {
  const tasks = await imageTasks()
  return {
    total: tasks.length,
    active: tasks.filter(
      (task) => task.status === 'pending' || task.status === 'running',
    ).length,
    finishedAt: tasks.reduce(
      (latest, task) =>
        task.status === 'completed' || task.status === 'failed'
          ? Math.max(latest, task.finishedAt ?? task.createdAt)
          : latest,
      0,
    ),
    cloudCompletedAt: tasks.reduce(
      (latest, task) =>
        task.source === GPT_IMAGE_SOURCE_MODEL && task.status === 'completed'
          ? Math.max(latest, task.finishedAt ?? task.createdAt)
          : latest,
      0,
    ),
  }
}

export async function getImageTaskPage(page: number, pageSize: number) {
  const tasks = await imageTasks()
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(tasks.length / pageSize)),
  )
  return {
    items: tasks.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    total: tasks.length,
    page: currentPage,
    pageSize,
  }
}

/** 下载和批量操作按需查询；不返回历史参考图、用量和错误详情。 */
export async function getImageTaskOutputs() {
  return (await imageTasks())
    .filter((task) => task.status === 'completed')
    .map((task) => ({
      id: task.id,
      name:
        task.inputSnapshot?.title ||
        task.inputSnapshot?.prompt ||
        `task_${task.id}`,
      outputUrls: task.outputUrls?.length
        ? task.outputUrls
        : task.outputUrl
          ? [task.outputUrl]
          : [],
    }))
}

export async function getImageTaskIds(status?: Task['status']) {
  return (await imageTasks())
    .filter((task) => !status || task.status === status)
    .map((task) => task.id)
}

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
