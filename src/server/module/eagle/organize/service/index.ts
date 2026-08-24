import type {
  OrganizeFailedItem,
  OrganizeItemStatus,
  OrganizePrepareResp,
  OrganizeQueueResp,
  OrganizeResultDetail,
  OrganizeResultListItem,
  OrganizeStatus,
  OrganizeTaskView,
} from '@/shared/eagle/organize'
import { changeBus } from '../../../../common/storage/change-bus'
import { ORGANIZE_RESOURCE } from '../constants'
import { queueService } from './queue'
import { resultService } from './result'
import { taskService } from './task'
import type {
  CreateTaskResult,
  OrganizeActionResult,
  OrganizeCreateTaskParams,
  OrganizePrepareParams,
} from './types'

export type {
  CreateTaskResult,
  OrganizeActionResult,
  OrganizeCreateTaskParams,
  OrganizePrepareParams,
}

/**
 * 图片整理任务服务：任务生命周期（创建/暂停/恢复）、结果读取与变更事件发布。
 * 持久化由 OrganizeRepository 负责；所有状态变更必须经由本服务，
 * 队列推进由 OrganizeExecutor 在后台完成（创建/恢复时 kick）。
 */
class OrganizeService {
  private readonly ready: Promise<void>

  constructor() {
    // 登记为可订阅的变更资源（/api/storage/events?resources=eagle.organize）
    changeBus.register(ORGANIZE_RESOURCE)
    this.ready = taskService.recoverInterruptedTask()
  }

  // --- Task 生命周期与准备 ---
  async getStatus(): Promise<OrganizeStatus | null> {
    await this.ready
    return taskService.getStatus()
  }

  async getTask(): Promise<OrganizeTaskView | null> {
    await this.ready
    return taskService.getTask()
  }

  async prepare(params: OrganizePrepareParams): Promise<OrganizePrepareResp> {
    await this.ready
    return taskService.prepare(params)
  }

  async createTask(
    params: OrganizeCreateTaskParams,
  ): Promise<CreateTaskResult> {
    await this.ready
    return taskService.createTask(params)
  }

  async appendItems(count: number): Promise<OrganizeActionResult> {
    await this.ready
    return taskService.appendItems(count)
  }

  async pauseTask(): Promise<boolean> {
    await this.ready
    return taskService.pauseTask()
  }

  async resumeTask(): Promise<boolean> {
    await this.ready
    return taskService.resumeTask()
  }

  async clearTask(): Promise<void> {
    await this.ready
    return taskService.clearTask()
  }

  // --- Queue 队列预览与失败处理 ---
  async getQueue(limit: number): Promise<OrganizeQueueResp> {
    await this.ready
    return queueService.getQueue(limit)
  }

  async listFailedItems(): Promise<OrganizeFailedItem[]> {
    await this.ready
    return queueService.listFailedItems()
  }

  async retryFailedItems(): Promise<OrganizeActionResult> {
    await this.ready
    return queueService.retryFailedItems()
  }

  async skipFailedItems(): Promise<OrganizeActionResult> {
    await this.ready
    return queueService.skipFailedItems()
  }

  async classifySuccessfulItems(): Promise<OrganizeActionResult> {
    await this.ready
    return queueService.classifySuccessfulItems()
  }

  // --- Result 结果管理与单图决策 ---
  async listResults(
    status?: OrganizeItemStatus,
    options?: { offset?: number; limit?: number },
  ): Promise<OrganizeResultListItem[]> {
    await this.ready
    return resultService.listResults(status, options)
  }

  async getResult(itemId: string): Promise<OrganizeResultDetail | null> {
    await this.ready
    return resultService.getResult(itemId)
  }

  async confirmItem(
    itemId: string,
    folderPath: string,
    withTitle: boolean,
    folderId?: string,
  ): Promise<OrganizeActionResult> {
    await this.ready
    return resultService.confirmItem(itemId, folderPath, withTitle, folderId)
  }

  async clearItemClassification(itemId: string): Promise<OrganizeActionResult> {
    await this.ready
    return resultService.clearItemClassification(itemId)
  }

  async skipItem(itemId: string): Promise<OrganizeActionResult> {
    await this.ready
    return resultService.skipItem(itemId)
  }

  async retryItem(itemId: string): Promise<OrganizeActionResult> {
    await this.ready
    return resultService.retryItem(itemId)
  }
}

export const organizeService = new OrganizeService()
