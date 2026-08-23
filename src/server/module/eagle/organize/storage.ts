import type {
  OrganizeFolderStandard,
  OrganizeItemRecord,
  OrganizeItemSummary,
} from '@/shared/eagle/organize'
import { ORGANIZE_CONCURRENCY_DEFAULT } from '@/shared/eagle/organize'
import { dataPath } from '../../../common/storage/data-path'
import { DocumentStore } from '../../../common/storage/document-store'
import { EntityStore } from '../../../common/storage/entity-store'
import { StorageError } from '../../../common/storage/errors'

/**
 * 图片整理任务私有持久化（沿用 TaskRepository 模式）：
 * 复用通用存储引擎（原子写入 + 串行队列 + 损坏报错），
 * 但不注册到 storageRegistry，前端只能通过 /api/eagle/organize/* 专用接口访问。
 *
 * - 任务本体（task.json）：队列 itemIds 按处理顺序保存，上万条 id 体积可观，
 *   maxValueLength 放宽到 16M
 * - 单图结果（items/<itemId>.json）：执行完成时才落盘（懒创建），
 *   避免创建任务时一次性写入上万个小文件；itemId 即 Eagle 条目 id
 * - 任务文档的读改写一律走 mutateTask（内存串行队列），
 *   服务（暂停/恢复）与执行器（计数推进）并发更新时不会互相覆盖
 */

/** 任务文档 value：队列与进度（executed / pendingConfirm 等计数由服务维护） */
export interface OrganizeTaskRecord {
  phase: 'running' | 'paused' | 'confirming' | 'done'
  pausedReason: 'user' | 'error' | 'restart' | null
  compress: boolean
  /** 队列执行并发数（创建任务时用户指定；旧任务文档可能缺失，读取时兜底默认值） */
  concurrency: number
  createdAt: number
  standards: OrganizeFolderStandard[]
  /** 锁定的文件夹 ID（空或 undefined 为全部） */
  folderId?: string
  /** 锁定的文件夹展示名称 */
  folderName?: string
  /** 处理队列：按创建时排序的图片 id */
  itemIds: string[]
  /** 已执行完成（success / failed / skipped / confirmed）的数量 */
  executed: number
  /** 待确认数量（仅 success 且未确认/未跳过） */
  pendingConfirm: number
  /** 判定成功数量（执行器维护，旧任务文档可能缺失，读取时兜底为 0） */
  successCount: number
  /** 判定失败数量（执行器维护，同上） */
  failedCount: number
}

export class OrganizeRepository {
  private readonly taskStore = new DocumentStore<OrganizeTaskRecord>(
    dataPath('eagle', 'organize', 'task.json'),
    { maxValueLength: 16 * 1024 * 1024 },
  )

  private readonly itemStore = new EntityStore<
    OrganizeItemRecord,
    OrganizeItemSummary
  >(dataPath('eagle', 'organize', 'items'))

  /** 任务文档读改写的串行队列（tail 模式，与 ResourceLock 同思路） */
  private taskTail: Promise<unknown> = Promise.resolve()

  async getTask(): Promise<OrganizeTaskRecord | null> {
    const doc = await this.taskStore.get()
    const task = doc.value
    if (!task) return null
    // 旧任务文档字段兜底
    return {
      ...task,
      folderId: task.folderId,
      folderName: task.folderName ?? '全部',
      successCount: task.successCount ?? 0,
      failedCount: task.failedCount ?? 0,
      concurrency: task.concurrency ?? ORGANIZE_CONCURRENCY_DEFAULT,
    }
  }

  async saveTask(task: OrganizeTaskRecord): Promise<void> {
    await this.taskStore.replace(task)
  }

  /** 强制清空：删除任务文档（之后的 getTask 返回 null），结果实体由 clearItems 清理 */
  async deleteTask(): Promise<void> {
    await this.taskStore.remove()
  }

  /**
   * 任务文档的串行读改写：mutate 返回新记录则落盘并返回之，
   * 返回 null / 原对象则不写并返回 null（未发生变更）。
   * 服务与执行器所有任务状态变更必须经由此方法，避免并发覆盖 phase / 计数
   */
  async mutateTask(
    mutate: (task: OrganizeTaskRecord) => OrganizeTaskRecord | null,
  ): Promise<OrganizeTaskRecord | null> {
    const run = async (): Promise<OrganizeTaskRecord | null> => {
      const task = await this.getTask()
      if (!task) return null
      const next = mutate(task)
      if (next && next !== task) {
        await this.saveTask(next)
        return next
      }
      return null
    }
    const result = this.taskTail.then(run, run)
    this.taskTail = result.catch(() => undefined)
    return result
  }

  async listItems(): Promise<
    Array<{ itemId: string } & OrganizeItemSummary & { updatedAt: number }>
  > {
    const items = await this.itemStore.list()
    return items.map(({ id, summary, updatedAt }) => ({
      itemId: id,
      ...summary,
      updatedAt,
    }))
  }

  async getItem(itemId: string): Promise<OrganizeItemRecord | null> {
    try {
      const entity = await this.itemStore.get(itemId)
      return entity.value
    } catch (error) {
      if (error instanceof StorageError && error.code === 'NOT_FOUND') {
        return null
      }
      throw error
    }
  }

  /** 落盘单图结果（首次懒创建；「重新执行」复写已有实体） */
  async saveItem(record: OrganizeItemRecord): Promise<void> {
    const summary: OrganizeItemSummary = { status: record.status }
    try {
      await this.itemStore.create(record, summary, record.itemId)
    } catch (error) {
      if (error instanceof StorageError && error.code === 'REVISION_CONFLICT') {
        await this.itemStore.replace(record.itemId, record, summary)
        return
      }
      throw error
    }
  }

  /** 新任务创建前清空旧结果实体 */
  async clearItems(): Promise<void> {
    const items = await this.itemStore.list()
    for (const { id } of items) {
      await this.itemStore.remove(id)
    }
  }
}

/** 全局单例：service 与 executor 必须共用同一实例（mutateTask 串行语义） */
export const organizeRepository = new OrganizeRepository()
