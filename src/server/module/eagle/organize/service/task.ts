import type {
  OrganizePrepareResp,
  OrganizeStatus,
  OrganizeTaskView,
} from '@/shared/eagle/organize'
import { getClassifiableItems, getFolderStandards } from '../../library'
import { organizeExecutor } from '../executor'
import { organizeRepository, type OrganizeTaskRecord } from '../storage'
import { publishOrganizeChange, resolveFolderName, toTaskView } from './helpers'
import type {
  CreateTaskResult,
  OrganizeActionResult,
  OrganizeCreateTaskParams,
  OrganizePrepareParams,
} from './types'

export class TaskService {
  /** 服务重启后，正在执行的任务标记为已暂停（请求中断，in-flight 结果未落盘） */
  async recoverInterruptedTask(): Promise<void> {
    try {
      const task = await organizeRepository.getTask()
      if (task && task.phase === 'running') {
        await organizeRepository.saveTask({
          ...task,
          phase: 'paused',
          pausedReason: 'restart',
        })
        publishOrganizeChange()
      }
    } catch (error) {
      console.error('[Eagle] 图片整理任务启动恢复失败', error)
    }
  }

  /** 徽标与弹窗用轻量状态；无任务返回 null */
  async getStatus(): Promise<OrganizeStatus | null> {
    const task = await organizeRepository.getTask()
    if (!task) return null
    return {
      phase: task.phase,
      remaining: task.itemIds.length - task.executed,
      pendingConfirm: task.pendingConfirm,
      failedCount: task.failedCount,
      pausedReason: task.pausedReason,
      folderId: task.folderId,
      folderName: task.folderName,
      isLocked: task.phase !== 'done',
    }
  }

  async getTask(): Promise<OrganizeTaskView | null> {
    const task = await organizeRepository.getTask()
    if (!task) return null
    let availableCount: number | undefined
    if (task.phase !== 'done') {
      try {
        const { total } = await getClassifiableItems({
          folderId: task.folderId,
          sortBy: 'mtime',
          sortOrder: 'desc',
        })
        availableCount = Math.max(0, total - task.itemIds.length)
      } catch {
        // ignore
      }
    }
    return toTaskView(task, availableCount)
  }

  /** 步骤 1 准备数据：分类标准 + 当前范围内可处理图片数（支持锁定模式与追加模式） */
  async prepare(params: OrganizePrepareParams): Promise<OrganizePrepareResp> {
    const task = await organizeRepository.getTask()
    if (task && task.phase !== 'done') {
      // 处于锁定文件夹状态：以任务锁定的 folderId 和 standards 为准
      const allItems = await getClassifiableItems({
        folderId: task.folderId,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
      })
      const imageCount = allItems.total
      const enqueuedCount = task.itemIds.length
      const availableCount = Math.max(0, imageCount - enqueuedCount)
      return {
        standards: task.standards,
        imageCount,
        enqueuedCount,
        availableCount,
        lockedFolderId: task.folderId,
        lockedFolderName: task.folderName,
      }
    }

    const [standards, items] = await Promise.all([
      getFolderStandards(),
      getClassifiableItems(params),
    ])
    return {
      standards,
      imageCount: items.total,
      enqueuedCount: 0,
      availableCount: items.total,
    }
  }

  async createTask(
    params: OrganizeCreateTaskParams,
  ): Promise<CreateTaskResult> {
    const existing = await organizeRepository.getTask()
    if (existing && existing.phase !== 'done') {
      return {
        ok: false,
        status: 409,
        error: '当前仍有未完成的整理任务，请先处理或等待完成',
      }
    }
    const standards = await getFolderStandards()
    if (standards.length === 0) {
      return {
        ok: false,
        status: 400,
        error: '没有包含描述的文件夹，请先在文件夹编辑中填写描述作为分类标准',
      }
    }
    const { total, itemIds } = await getClassifiableItems(params)
    if (total === 0) {
      return { ok: false, status: 400, error: '当前范围内没有可处理的图片' }
    }
    const folderName = await resolveFolderName(params.folderId)
    const record: OrganizeTaskRecord = {
      phase: 'running',
      pausedReason: null,
      compress: params.compress,
      concurrency: params.concurrency,
      createdAt: Date.now(),
      standards,
      folderId: params.folderId,
      folderName,
      itemIds: itemIds.slice(0, Math.min(params.count, total)),
      executed: 0,
      pendingConfirm: 0,
      successCount: 0,
      failedCount: 0,
    }
    // 旧任务已结束（或无任务）：清空旧结果后落盘新任务
    await organizeRepository.clearItems()
    await organizeRepository.saveTask(record)
    publishOrganizeChange()
    organizeExecutor.kick()
    return {
      ok: true,
      task: toTaskView(record, Math.max(0, total - record.itemIds.length)),
    }
  }

  /** 向当前锁定任务追加未入队的图片到队尾 */
  async appendItems(count: number): Promise<OrganizeActionResult> {
    const task = await organizeRepository.getTask()
    if (!task || task.phase === 'done') {
      return {
        ok: false,
        status: 409,
        error: '当前没有正在进行的任务可追加图片',
      }
    }
    const { itemIds: allAvailable } = await getClassifiableItems({
      folderId: task.folderId,
      sortBy: 'mtime',
      sortOrder: 'desc',
    })
    const existing = new Set(task.itemIds)
    const toAppend = allAvailable
      .filter((id) => !existing.has(id))
      .slice(0, count)
    if (toAppend.length === 0) {
      return { ok: false, status: 400, error: '没有更多可追加的图片' }
    }
    const updated = await organizeRepository.mutateTask((latest) => {
      if (!latest || latest.phase === 'done') return null
      return {
        ...latest,
        itemIds: [...latest.itemIds, ...toAppend],
        phase: latest.phase === 'confirming' ? 'running' : latest.phase,
      }
    })
    if (!updated) {
      return { ok: false, status: 409, error: '追加图片失败' }
    }
    publishOrganizeChange()
    organizeExecutor.kick()
    return { ok: true }
  }

  /** 用户暂停：停止派发新请求；返回 false 表示当前不可暂停 */
  async pauseTask(): Promise<boolean> {
    organizeExecutor.stop()
    const updated = await organizeRepository.mutateTask((task) =>
      task.phase === 'running'
        ? { ...task, phase: 'paused', pausedReason: 'user' }
        : null,
    )
    if (!updated) return false
    publishOrganizeChange()
    return true
  }

  async resumeTask(): Promise<boolean> {
    const updated = await organizeRepository.mutateTask((task) =>
      task.phase === 'paused'
        ? { ...task, phase: 'running', pausedReason: null }
        : null,
    )
    if (!updated) return false
    publishOrganizeChange()
    organizeExecutor.kick()
    return true
  }

  /**
   * 强制清空任务（步骤 2 红色按钮）：中断 in-flight 请求、丢弃任务与全部结果。
   * 先等执行器收尾再删数据，保证不会有过期结果在删除后落盘
   */
  async clearTask(): Promise<void> {
    await organizeExecutor.abort()
    await organizeRepository.deleteTask()
    await organizeRepository.clearItems()
    publishOrganizeChange()
  }
}

export const taskService = new TaskService()
