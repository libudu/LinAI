import type { GptImageQuality, GptImageSize } from '@/shared/image/params'
import type { TaskInputSnapshot } from '@/shared/image/template'
import { Logger } from '../logger'
import { deleteUnreferencedImages } from '../static'
import { changeBus } from '../storage/change-bus'
import { StorageError } from '../storage/errors'
import { TaskRepository } from './repository'
import { TASKS_RESOURCE, type ComfyTaskMetadata, type Task } from './types'

/**
 * 任务服务：任务状态流转、输出文件清理、启动恢复与变更事件发布。
 * 持久化由 TaskRepository 负责；任务数据由后端生成和消费，
 * 所有状态变更必须经由本服务，保证状态、错误信息、输出文件和变更通知一致
 */
export class TaskService {
  private readonly repository = new TaskRepository()
  private readonly logger = new Logger('task-service')
  private readonly ready: Promise<void>

  constructor() {
    // 登记为可订阅的变更资源（/api/storage/events）
    changeBus.register(TASKS_RESOURCE)
    this.ready = this.recoverInterruptedTasks()
  }

  /** 服务重启后，上次运行中断的 pending/running 任务标记为失败（一次落盘） */
  private async recoverInterruptedTasks(): Promise<void> {
    try {
      const tasks = await this.repository.list()
      const interrupted = tasks.filter(
        (t) => t.status === 'pending' || t.status === 'running',
      )
      if (interrupted.length === 0) return
      await this.repository.replaceAll(
        interrupted.map((t) => ({
          ...t,
          status: 'failed' as const,
          error: '[服务] 连接已丢失',
        })),
      )
      this.publishChange()
    } catch (error) {
      this.logger.error('Failed to reset tasks on init:', error)
    }
  }

  private publishChange(): void {
    changeBus.publish({ resource: TASKS_RESOURCE })
  }

  async getTasks(): Promise<Task[]> {
    await this.ready
    return this.repository.list()
  }

  async createTaskFromSnapshot(options: {
    id?: string
    snapshot: TaskInputSnapshot
    source: string
    size?: GptImageSize
    quality?: GptImageQuality
    metadata?: ComfyTaskMetadata
  }): Promise<Task> {
    await this.ready
    const task = await this.repository.create(
      {
        inputSnapshot: options.snapshot,
        source: options.source,
        size: options.size,
        quality: options.quality,
        ...options.metadata,
        status: 'pending',
      },
      options.id,
    )
    this.publishChange()
    return task
  }

  /** 后台任务仅能从未结束状态写入；删除或重启恢复后不得重新完成。 */
  async updateActiveTask(
    id: string,
    updates: Partial<
      Omit<Task, 'id' | 'createdAt' | 'inputSnapshot' | 'source'>
    >,
  ): Promise<boolean> {
    await this.ready
    try {
      await this.repository.update(id, (record) => {
        if (record.status !== 'pending' && record.status !== 'running') {
          throw new Error('TASK_NOT_ACTIVE')
        }
        return { ...record, ...updates }
      })
    } catch (error) {
      if (
        (error instanceof StorageError && error.code === 'NOT_FOUND') ||
        (error instanceof Error && error.message === 'TASK_NOT_ACTIVE')
      )
        return false
      throw error
    }
    this.publishChange()
    return true
  }

  /** 删除任务；keepImage 为 false 时同时删除已生成的输出图片 */
  async deleteTask(id: string, keepImage?: boolean): Promise<boolean> {
    await this.ready
    let target: Task
    try {
      target = await this.repository.remove(id)
    } catch (error) {
      if (error instanceof StorageError && error.code === 'NOT_FOUND')
        return false
      throw error
    }
    this.publishChange()

    if (!keepImage) {
      const urlsToDelete = target.outputUrls?.length
        ? target.outputUrls
        : target.outputUrl
          ? [target.outputUrl]
          : []

      if (urlsToDelete.length) {
        await deleteUnreferencedImages({
          type: 'generated',
          urls: urlsToDelete,
        }).catch((error) => this.logger.error('任务输出图片清理失败', error))
      }
    }
    return true
  }
}

export const taskService = new TaskService()
