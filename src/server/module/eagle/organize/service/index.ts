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
import type { EagleMediaType } from '@/shared/eagle/types'
import { EagleError } from '../../errors'
import { OrganizeExecutor } from '../executor'
import { migrateLegacyOrganizeTask } from '../migration'
import { OrganizeRepository } from '../storage'
import { QueueService } from './queue'
import { ResultService } from './result'
import { TaskService } from './task'
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
  private readonly repository: OrganizeRepository
  private readonly taskService: TaskService
  private readonly queueService: QueueService
  private readonly resultService: ResultService

  constructor(readonly mediaType: EagleMediaType) {
    this.repository = new OrganizeRepository(mediaType)
    const executor = new OrganizeExecutor(this.repository)
    this.taskService = new TaskService(this.repository, executor)
    this.queueService = new QueueService(this.repository, executor)
    this.resultService = new ResultService(this.repository, executor)
    changeBus.register(this.repository.resource)
    // 两类任务共用一次迁移屏障；迁移失败时拒绝读写，避免覆盖旧进度。
    this.ready = migrateLegacyOrganizeTask().then(() =>
      this.taskService.recoverInterruptedTask(),
    )
    void this.ready.catch((error) =>
      console.error('[Eagle] 整理任务初始化失败', error),
    )
  }

  /** 用户命令串行执行，防止两个确认请求读到同一份旧结果并重复扣减。 */
  private async runCommand<T>(
    action: () => Promise<T>,
    expectedTaskId: string | null,
  ): Promise<T> {
    await this.ready
    return resourceLock.run(
      `${this.repository.resource}:commands`,
      async () => {
        const task = await this.repository.getTask()
        if ((task?.taskId ?? null) !== expectedTaskId)
          throw new EagleError(
            'TASK_CHANGED',
            409,
            '整理任务已变更，请刷新后重试',
          )
        await this.repository.reconcileTaskIfNeeded()
        return action()
      },
    )
  }

  // --- Task 生命周期与准备 ---
  async getStatus(): Promise<OrganizeStatus | null> {
    await this.ready
    return this.taskService.getStatus()
  }

  async getTask(): Promise<OrganizeTaskView | null> {
    await this.ready
    return this.taskService.getTask()
  }

  async prepare(params: OrganizePrepareParams): Promise<OrganizePrepareResp> {
    await this.ready
    return this.taskService.prepare({ ...params, mediaType: this.mediaType })
  }

  async createTask(
    params: OrganizeCreateTaskParams,
    expectedTaskId: string | null,
  ): Promise<CreateTaskResult> {
    return this.runCommand(
      () =>
        this.taskService.createTask({ ...params, mediaType: this.mediaType }),
      expectedTaskId,
    )
  }

  async appendItems(
    params: OrganizeAppendParams,
    taskId: string,
  ): Promise<OrganizeActionResult> {
    return this.runCommand(
      () =>
        this.taskService.appendItems({ ...params, mediaType: this.mediaType }),
      taskId,
    )
  }

  async pauseTask(taskId: string): Promise<boolean> {
    return this.runCommand(() => this.taskService.pauseTask(), taskId)
  }

  async resumeTask(taskId: string): Promise<boolean> {
    return this.runCommand(() => this.taskService.resumeTask(), taskId)
  }

  async syncStandards(taskId: string): Promise<OrganizeActionResult> {
    return this.runCommand(() => this.taskService.syncStandards(), taskId)
  }

  async clearTask(taskId: string): Promise<void> {
    return this.runCommand(() => this.taskService.clearTask(), taskId)
  }

  // --- Queue 队列预览与失败处理 ---
  async getQueue(limit: number): Promise<OrganizeQueueResp> {
    await this.ready
    return this.queueService.getQueue(limit)
  }

  async listFailedItems(): Promise<OrganizeFailedItem[]> {
    await this.ready
    return this.queueService.listFailedItems()
  }

  async retryFailedItems(taskId: string): Promise<OrganizeActionResult> {
    return this.runCommand(() => this.queueService.retryFailedItems(), taskId)
  }

  async skipFailedItems(taskId: string): Promise<OrganizeActionResult> {
    return this.runCommand(() => this.queueService.skipFailedItems(), taskId)
  }

  async classifySuccessfulItems(taskId: string): Promise<OrganizeActionResult> {
    return this.runCommand(
      () => this.queueService.classifySuccessfulItems(),
      taskId,
    )
  }

  // --- Result 结果管理与单图决策 ---
  async listResults(
    status?: OrganizeItemStatus,
    options?: { offset?: number; limit?: number },
  ): Promise<OrganizeResultListItem[]> {
    await this.ready
    return this.resultService.listResults(status, options)
  }

  async syncResults(options: {
    resultsVersion?: string
    libraryVersion?: string
  }) {
    await this.ready
    return this.resultService.syncResults(options)
  }

  async reconcileResults(taskId: string): Promise<OrganizeActionResult> {
    return this.runCommand(() => this.resultService.reconcileResults(), taskId)
  }

  async getResult(itemId: string): Promise<OrganizeResultDetail | null> {
    await this.ready
    return this.resultService.getResult(itemId)
  }

  async confirmItem(
    taskId: string,
    itemId: string,
    folderPath: string,
    withTitle: boolean,
    folderId?: string,
  ): Promise<OrganizeActionResult> {
    return this.runCommand(
      () =>
        this.resultService.confirmItem(itemId, folderPath, withTitle, folderId),
      taskId,
    )
  }

  async confirmBatch(
    items: OrganizeConfirmItem[],
    taskId: string,
  ): Promise<OrganizeConfirmBatchResult> {
    return this.runCommand(() => this.resultService.confirmBatch(items), taskId)
  }

  async clearItemClassification(
    itemId: string,
    taskId: string,
  ): Promise<OrganizeActionResult> {
    return this.runCommand(
      () => this.resultService.clearItemClassification(itemId),
      taskId,
    )
  }

  async trashItem(
    itemId: string,
    taskId: string,
  ): Promise<OrganizeTrashResult> {
    return this.runCommand(() => this.resultService.trashItem(itemId), taskId)
  }

  async skipItem(
    itemId: string,
    taskId: string,
  ): Promise<OrganizeActionResult> {
    return this.runCommand(() => this.resultService.skipItem(itemId), taskId)
  }

  async retryItem(
    itemId: string,
    taskId: string,
  ): Promise<OrganizeActionResult> {
    return this.runCommand(() => this.resultService.retryItem(itemId), taskId)
  }
}

export const organizeServices = {
  image: new OrganizeService('image'),
  video: new OrganizeService('video'),
}
