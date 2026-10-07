import {
  type OrganizeClassificationMode,
  type OrganizeFolderStandard,
  type OrganizePrepareResp,
  type OrganizeStatus,
  type OrganizeTaskView,
} from '@/shared/eagle/organize'
import { randomUUID } from 'node:crypto'
import {
  getClassifiableItems,
  getFolderStandards,
  getItemSnapshots,
} from '../../library'
import { getEagleVisionEndpoint } from '../../settings'
import { organizeExecutor } from '../executor'
import type { OrganizeTaskRecord } from '../model'
import { organizeRepository } from '../storage'
import { transitionTask } from '../transitions'
import { publishOrganizeChange, resolveFolderName, toTaskView } from './helpers'
import type {
  CreateTaskResult,
  OrganizeActionResult,
  OrganizeAppendParams,
  OrganizeCreateTaskParams,
  OrganizePrepareParams,
} from './types'

/**
 * 校验两组分类标准是否完全一致（严格按顺序比对每个元素的 id、路径、名称与描述）。
 * 只要发生顺序变动、新增、删除或内容修改，即返回 false。
 */
const areStandardsEqual = (
  a: OrganizeFolderStandard[],
  b: OrganizeFolderStandard[],
): boolean => {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const s1 = a[i]
    const s2 = b[i]
    if (
      s1.folderId !== s2.folderId ||
      s1.folderPath !== s2.folderPath ||
      s1.name !== s2.name ||
      s1.description !== s2.description
    ) {
      return false
    }
  }
  return true
}

/**
 * 按图片 ID 计算当前文件夹中尚未进入任务的条目。
 * 图片可能属于多个文件夹或已被移动，因此必须与整轮任务的历史 ID 做集合差。
 */
const getAvailableItemIds = (itemIds: string[], enqueuedIds: string[]) => {
  const enqueued = new Set(enqueuedIds)
  return [...new Set(itemIds)].filter((id) => !enqueued.has(id))
}

const getClassificationStandards = (
  mode: OrganizeClassificationMode,
  folderId?: string,
): Promise<OrganizeFolderStandard[]> =>
  mode === 'recursive-rename'
    ? Promise.resolve([])
    : mode === 'subfolders'
      ? folderId
        ? getFolderStandards(folderId)
        : Promise.resolve([])
      : getFolderStandards()

/** 仅重命名递归取来源目录，并按当前模型筛掉已符合命名规则的图片。 */
const getSourceItems = async (
  params: OrganizePrepareParams,
  classificationMode = params.classificationMode ?? 'global',
) => {
  const modelId =
    classificationMode === 'recursive-rename'
      ? (await getEagleVisionEndpoint()).modelId
      : undefined
  return getClassifiableItems({ ...params, classificationMode }, modelId)
}

/** 与任务入队使用同一候选顺序，只查询前 50 条的名称，不返回完整素材列表。 */
const getSourcePreview = async (
  itemIds: string[],
  classificationMode: OrganizeClassificationMode,
): Promise<OrganizePrepareResp['previewItems']> => {
  if (classificationMode !== 'recursive-rename') return undefined
  const previewIds = itemIds.slice(0, 50)
  const snapshots = await getItemSnapshots(previewIds)
  return previewIds.map((itemId) => ({
    itemId,
    itemName: snapshots?.get(itemId)?.name ?? null,
  }))
}

export class TaskService {
  /** 服务重启后，正在执行的任务标记为已暂停（请求中断，in-flight 结果未落盘） */
  async recoverInterruptedTask(): Promise<void> {
    try {
      const task = await organizeRepository.getTask()
      if (!task) return
      await organizeRepository.mutateTask(async (latest) => {
        let reconciled = transitionTask(latest, {
          type: 'reconcile',
          items: await organizeRepository.getProgressItems(),
        })!
        // 旧版待确认结果及写库后尚未落盘状态的结果，恢复后交给执行器直接改名。
        if (
          reconciled.classificationMode === 'recursive-rename' &&
          reconciled.pendingConfirm > 0
        )
          reconciled = transitionTask(reconciled, {
            type: 'items-changed',
            changes: [],
            resume: true,
          })!
        return reconciled.phase === 'running'
          ? transitionTask(reconciled, { type: 'pause', reason: 'restart' })
          : reconciled
      })
      publishOrganizeChange()
    } catch (error) {
      console.error('[Eagle] 启动恢复图片整理任务失败', error)
    }
  }

  /** 徽标与弹窗用轻量状态；无任务返回 null */
  async getStatus(): Promise<OrganizeStatus | null> {
    const task = await organizeRepository.getTask()
    if (!task) return null
    return {
      taskId: task.taskId,
      classificationMode: task.classificationMode,
      createdAt: task.createdAt,
      phase: task.phase,
      total: task.itemIds.length,
      remaining: Math.max(0, task.itemIds.length - task.executed),
      pendingConfirm: task.pendingConfirm,
      failedCount: task.failedCount,
      pausedReason: task.pausedReason,
    }
  }

  async getTask(): Promise<OrganizeTaskView | null> {
    const task = await organizeRepository.getTask()
    if (!task) return null
    return toTaskView(task)
  }

  /** 步骤 1 准备数据：按当前选中范围统计，分类标准沿用未完成任务的快照 */
  async prepare(params: OrganizePrepareParams): Promise<OrganizePrepareResp> {
    const task = await organizeRepository.getTask()
    const sourceFolderName = await resolveFolderName(params.folderId)
    if (task && task.phase !== 'done') {
      const [allItems, latestStandards, history] = await Promise.all([
        getSourceItems(params, task.classificationMode),
        getClassificationStandards(task.classificationMode, task.folderId),
        organizeRepository.getItemStatuses(),
      ])
      const imageCount = allItems.total
      const availableItemIds = getAvailableItemIds(allItems.itemIds, [
        ...task.itemIds,
        ...history.keys(),
      ])
      const availableCount = availableItemIds.length
      const hasStandardsMismatch = !areStandardsEqual(
        task.standards,
        latestStandards,
      )
      return {
        taskId: task.taskId,
        sourceFolderName,
        classificationMode: task.classificationMode,
        classificationFolderName:
          task.classificationMode === 'subfolders'
            ? await resolveFolderName(task.folderId)
            : undefined,
        standards: task.standards,
        imageCount,
        enqueuedCount: imageCount - availableCount,
        availableCount,
        previewItems: await getSourcePreview(
          availableItemIds,
          task.classificationMode,
        ),
        hasActiveTask: true,
        hasStandardsMismatch,
      }
    }

    const classificationMode = params.classificationMode ?? 'global'
    const [standards, items] = await Promise.all([
      getClassificationStandards(classificationMode, params.folderId),
      getSourceItems(params),
    ])
    return {
      taskId: task?.taskId ?? null,
      sourceFolderName,
      classificationMode,
      classificationFolderName:
        classificationMode === 'subfolders' ? sourceFolderName : undefined,
      standards,
      imageCount: items.total,
      enqueuedCount: 0,
      availableCount: items.total,
      previewItems: await getSourcePreview(items.itemIds, classificationMode),
      hasActiveTask: false,
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
    const standards = await getClassificationStandards(
      params.classificationMode,
      params.folderId,
    )
    if (
      standards.length === 0 &&
      params.classificationMode !== 'recursive-rename'
    ) {
      return {
        ok: false,
        status: 400,
        error:
          params.classificationMode === 'subfolders'
            ? '当前文件夹下没有包含描述的子目录，请先填写子目录描述作为分类标准'
            : '没有包含描述的文件夹，请先在文件夹编辑中填写描述作为分类标准',
      }
    }
    const { total, itemIds } = await getSourceItems(params)
    if (total === 0) {
      return { ok: false, status: 400, error: '当前范围内没有可处理的图片' }
    }
    const folderName = await resolveFolderName(params.folderId)
    const record: OrganizeTaskRecord = {
      taskId: randomUUID(),
      phase: 'running',
      pausedReason: null,
      compress: params.compress,
      concurrency: params.concurrency,
      createdAt: Date.now(),
      standards,
      classificationMode: params.classificationMode,
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
      task: toTaskView(record),
    }
  }

  /** 从指定范围追加图片，在任务串行更新内按 ID 去重，避免并发重复入队 */
  async appendItems(
    params: OrganizeAppendParams,
  ): Promise<OrganizeActionResult> {
    const task = await organizeRepository.getTask()
    if (!task || task.phase === 'done') {
      return {
        ok: false,
        status: 409,
        error: '当前没有正在进行的任务可追加图片',
      }
    }
    const [{ itemIds: allAvailable }, history] = await Promise.all([
      getSourceItems(params, task.classificationMode),
      organizeRepository.getItemStatuses(),
    ])
    const historyIds = [...history.keys()]
    let noAvailableItems = false
    const updated = await organizeRepository.mutateTask((latest) => {
      // 读取范围期间任务可能完成或被替换，不把旧请求追加到新任务。
      if (latest.phase === 'done' || latest.taskId !== task.taskId) return null
      const toAppend = getAvailableItemIds(allAvailable, [
        ...latest.itemIds,
        ...historyIds,
      ]).slice(0, params.count)
      if (toAppend.length === 0) {
        noAvailableItems = true
        return null
      }
      return transitionTask(latest, { type: 'append', itemIds: toAppend })
    })
    if (!updated) {
      return noAvailableItems
        ? { ok: false, status: 400, error: '当前范围内没有更多可追加的图片' }
        : { ok: false, status: 409, error: '任务状态已变更，请刷新后重试' }
    }
    publishOrganizeChange()
    if (updated.phase === 'running') organizeExecutor.kick()
    return { ok: true }
  }

  /** 用户暂停：停止派发新请求；返回 false 表示当前不可暂停 */
  async pauseTask(): Promise<boolean> {
    organizeExecutor.stop()
    const updated = await organizeRepository.mutateTask((task) =>
      transitionTask(task, { type: 'pause', reason: 'user' }),
    )
    if (!updated) return false
    publishOrganizeChange()
    return true
  }

  async resumeTask(): Promise<boolean> {
    const updated = await organizeRepository.mutateTask((task) =>
      transitionTask(task, { type: 'resume' }),
    )
    if (!updated) return false
    publishOrganizeChange()
    organizeExecutor.kick()
    return true
  }

  /**
   * 同步最新分类标准：
   * 只要任务不是正在运行状态（非 running，且任务未结束 done）即可同步（如 paused、confirming 等）。
   * 将当前外部最新的文件夹标准快照原子写回 task.standards 并发布变更。
   */
  async syncStandards(): Promise<OrganizeActionResult> {
    const task = await organizeRepository.getTask()
    if (!task || task.phase === 'running' || task.phase === 'done') {
      return {
        ok: false,
        status: 409,
        error:
          task?.phase === 'running'
            ? '任务正在执行中，请先暂停后再同步分类标准'
            : '当前没有正在进行或待确认的整理任务',
      }
    }
    const latestStandards = await getClassificationStandards(
      task.classificationMode,
      task.folderId,
    )
    if (task.classificationMode === 'recursive-rename') return { ok: true }
    if (latestStandards.length === 0) {
      return {
        ok: false,
        status: 400,
        error:
          task.classificationMode === 'subfolders'
            ? '分类范围内没有包含描述的子目录，无法同步'
            : '当前没有包含描述的文件夹，无法同步',
      }
    }
    const updated = await organizeRepository.mutateTask((current) => {
      if (!current || current.phase === 'running' || current.phase === 'done')
        return null
      return {
        ...current,
        standards: latestStandards,
      }
    })
    if (!updated) {
      return {
        ok: false,
        status: 409,
        error: '任务状态已变更，请刷新后重试',
      }
    }
    publishOrganizeChange()
    return { ok: true }
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
