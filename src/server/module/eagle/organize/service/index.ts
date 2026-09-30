import { changeBus } from '@/server/common/storage/change-bus'
import { resourceLock } from '@/server/common/storage/resource-lock'
import type {
  OrganizeConfirmBatchResult,
  OrganizeConfirmItem,
  OrganizeFailedItem,
  OrganizeItemStatus,
  OrganizePrepareResp,
  OrganizeQueueResp,
  OrganizeResultDetail,
  OrganizeResultListItem,
  OrganizeStatus,
  OrganizeTaskView,
} from '@/shared/eagle/organize'
import { ORGANIZE_RESOURCE } from '../constants'
import { queueService } from './queue'
import { resultService } from './result'
import { taskService } from './task'
import type {
  CreateTaskResult,
  OrganizeActionResult,
  OrganizeAppendParams,
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

  /** 用户命令串行执行，防止两个确认请求读到同一份旧结果并重复扣减。 */
  private async runCommand<T>(action: () => Promise<T>): Promise<T> {
    await this.ready
    return resourceLock.run(`${ORGANIZE_RESOURCE}:commands`, action)
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
    return this.runCommand(() => taskService.createTask(params))
  }

  async appendItems(
    params: OrganizeAppendParams,
  ): Promise<OrganizeActionResult> {
    return this.runCommand(() => taskService.appendItems(params))
  }

  async pauseTask(): Promise<boolean> {
    return this.runCommand(() => taskService.pauseTask())
  }

  async resumeTask(): Promise<boolean> {
    return this.runCommand(() => taskService.resumeTask())
  }

  async syncStandards(): Promise<OrganizeActionResult> {
    return this.runCommand(() => taskService.syncStandards())
  }

  async clearTask(): Promise<void> {
    return this.runCommand(() => taskService.clearTask())
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
    return this.runCommand(() => queueService.retryFailedItems())
  }

  async skipFailedItems(): Promise<OrganizeActionResult> {
    return this.runCommand(() => queueService.skipFailedItems())
  }

  async classifySuccessfulItems(): Promise<OrganizeActionResult> {
    return this.runCommand(() => queueService.classifySuccessfulItems())
  }

  // --- Result 结果管理与单图决策 ---
  async listResults(
    status?: OrganizeItemStatus,
    options?: { offset?: number; limit?: number },
  ): Promise<OrganizeResultListItem[]> {
    // success 列表会自愈已删除项，作为命令与用户决策串行。
    return this.runCommand(() => resultService.listResults(status, options))
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
    return this.runCommand(() =>
      resultService.confirmItem(itemId, folderPath, withTitle, folderId),
    )
  }

  async confirmBatch(
    items: OrganizeConfirmItem[],
    taskCreatedAt?: number,
  ): Promise<OrganizeConfirmBatchResult> {
    return this.runCommand(() =>
      resultService.confirmBatch(items, taskCreatedAt),
    )
  }

  async clearItemClassification(itemId: string): Promise<OrganizeActionResult> {
    return this.runCommand(() => resultService.clearItemClassification(itemId))
  }

  async skipItem(itemId: string): Promise<OrganizeActionResult> {
    return this.runCommand(() => resultService.skipItem(itemId))
  }

  async retryItem(itemId: string): Promise<OrganizeActionResult> {
    return this.runCommand(() => resultService.retryItem(itemId))
  }
}

export const organizeService = new OrganizeService()
