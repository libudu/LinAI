import { changeBus } from '@/server/common/storage/change-bus'
import { resourceLock } from '@/server/common/storage/resource-lock'
import type {
  OrganizeConfirmBatchResult,
  OrganizeFailedItem,
  OrganizeItemStatus,
  OrganizePrepareResp,
  OrganizeQueueResp,
  OrganizeResultDetail,
  OrganizeResultListItem,
  OrganizeStatus,
  OrganizeTaskView,
} from '@/shared/eagle/organize'
import { EagleError } from '../../errors'
import { ORGANIZE_RESOURCE } from '../constants'
import { organizeRepository } from '../storage'
import { queueService } from './queue'
import { resultService } from './result'
import { taskService } from './task'
import type {
  CreateTaskResult,
  OrganizeActionResult,
  OrganizeAppendParams,
  OrganizeConfirmItem,
  OrganizeCreateTaskParams,
  OrganizePrepareParams,
  OrganizeTrashResult,
} from './types'

export type {
  CreateTaskResult,
  OrganizeActionResult,
  OrganizeConfirmItem,
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
  private async runCommand<T>(
    action: () => Promise<T>,
    expectedTaskId: string | null,
  ): Promise<T> {
    await this.ready
    return resourceLock.run(`${ORGANIZE_RESOURCE}:commands`, async () => {
      const task = await organizeRepository.getTask()
      if ((task?.taskId ?? null) !== expectedTaskId)
        throw new EagleError(
          'TASK_CHANGED',
          409,
          '整理任务已变更，请刷新后重试',
        )
      await organizeRepository.reconcileTaskIfNeeded()
      return action()
    })
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
    expectedTaskId: string | null,
  ): Promise<CreateTaskResult> {
    return this.runCommand(() => taskService.createTask(params), expectedTaskId)
  }

  async appendItems(
    params: OrganizeAppendParams,
    taskId: string,
  ): Promise<OrganizeActionResult> {
    return this.runCommand(() => taskService.appendItems(params), taskId)
  }

  async pauseTask(taskId: string): Promise<boolean> {
    return this.runCommand(() => taskService.pauseTask(), taskId)
  }

  async resumeTask(taskId: string): Promise<boolean> {
    return this.runCommand(() => taskService.resumeTask(), taskId)
  }

  async syncStandards(taskId: string): Promise<OrganizeActionResult> {
    return this.runCommand(() => taskService.syncStandards(), taskId)
  }

  async clearTask(taskId: string): Promise<void> {
    return this.runCommand(() => taskService.clearTask(), taskId)
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

  async retryFailedItems(taskId: string): Promise<OrganizeActionResult> {
    return this.runCommand(() => queueService.retryFailedItems(), taskId)
  }

  async skipFailedItems(taskId: string): Promise<OrganizeActionResult> {
    return this.runCommand(() => queueService.skipFailedItems(), taskId)
  }

  async classifySuccessfulItems(taskId: string): Promise<OrganizeActionResult> {
    return this.runCommand(() => queueService.classifySuccessfulItems(), taskId)
  }

  // --- Result 结果管理与单图决策 ---
  async listResults(
    status?: OrganizeItemStatus,
    options?: { offset?: number; limit?: number },
  ): Promise<OrganizeResultListItem[]> {
    await this.ready
    return resultService.listResults(status, options)
  }

  async reconcileResults(taskId: string): Promise<OrganizeActionResult> {
    return this.runCommand(() => resultService.reconcileResults(), taskId)
  }

  async getResult(itemId: string): Promise<OrganizeResultDetail | null> {
    await this.ready
    return resultService.getResult(itemId)
  }

  async confirmItem(
    taskId: string,
    itemId: string,
    folderPath: string,
    withTitle: boolean,
    folderId?: string,
  ): Promise<OrganizeActionResult> {
    return this.runCommand(
      () => resultService.confirmItem(itemId, folderPath, withTitle, folderId),
      taskId,
    )
  }

  async confirmBatch(
    items: OrganizeConfirmItem[],
    taskId: string,
  ): Promise<OrganizeConfirmBatchResult> {
    return this.runCommand(() => resultService.confirmBatch(items), taskId)
  }

  async clearItemClassification(
    itemId: string,
    taskId: string,
  ): Promise<OrganizeActionResult> {
    return this.runCommand(
      () => resultService.clearItemClassification(itemId),
      taskId,
    )
  }

  async trashItem(
    itemId: string,
    taskId: string,
  ): Promise<OrganizeTrashResult> {
    return this.runCommand(() => resultService.trashItem(itemId), taskId)
  }

  async skipItem(
    itemId: string,
    taskId: string,
  ): Promise<OrganizeActionResult> {
    return this.runCommand(() => resultService.skipItem(itemId), taskId)
  }

  async retryItem(
    itemId: string,
    taskId: string,
  ): Promise<OrganizeActionResult> {
    return this.runCommand(() => resultService.retryItem(itemId), taskId)
  }
}

export const organizeService = new OrganizeService()
