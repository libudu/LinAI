import type { TaskInputSnapshot } from '@/shared/image/template'
import fs from 'fs-extra'
import path from 'path'
import { GptImageQuality, GptImageSize } from '../../module/gpt-image/enum'
import { Logger } from '../../module/utils/logger'
import { GENERATED_IMAGES_DIR } from '../static'
import { GENERATED_IMAGES_API_PATH } from '../static/enum'
import { changeBus } from '../storage/change-bus'
import { TaskRepository } from './repository'
import { TASKS_RESOURCE, Task } from './types'

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
    snapshot: TaskInputSnapshot
    source: string
    size?: GptImageSize
    quality?: GptImageQuality
  }): Promise<Task> {
    await this.ready
    const task = await this.repository.create({
      inputSnapshot: options.snapshot,
      source: options.source,
      size: options.size,
      quality: options.quality,
      status: 'pending',
    })
    this.publishChange()
    return task
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<boolean> {
    await this.ready
    try {
      // id/createdAt 由信封管理，不允许通过 updates 覆盖
      const { id: _id, createdAt: _createdAt, ...rest } = updates
      await this.repository.update(id, (record) => ({ ...record, ...rest }))
    } catch {
      return false
    }
    this.publishChange()
    return true
  }

  async updateTaskStatus(
    id: string,
    status: Task['status'],
    error?: string,
  ): Promise<boolean> {
    return this.updateTask(id, error ? { status, error } : { status })
  }

  /** 删除任务；keepImage 为 false 时同时删除已生成的输出图片 */
  async deleteTask(id: string, keepImage?: boolean): Promise<boolean> {
    await this.ready
    const tasks = await this.repository.list()
    const target = tasks.find((t) => t.id === id)
    if (!target) {
      return false
    }

    await this.repository.remove(id)
    this.publishChange()

    if (!keepImage) {
      const urlsToDelete = target.outputUrls
        ? target.outputUrls
        : target.outputUrl
          ? [target.outputUrl]
          : []

      for (const outputUrl of urlsToDelete) {
        if (outputUrl.startsWith('/api/static/')) {
          try {
            const filepath = path.join(
              GENERATED_IMAGES_DIR,
              outputUrl.replace(GENERATED_IMAGES_API_PATH + '/', ''),
            )

            if (filepath && fs.existsSync(filepath)) {
              await fs.unlink(filepath)
            }
          } catch (error: any) {
            this.logger.error('Failed to delete task file:', error)
          }
        }
      }
    }
    return true
  }
}

export const taskService = new TaskService()
