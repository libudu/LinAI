import type {
  OrganizeFolderStandard,
  OrganizeItemRecord,
  OrganizeItemSummary,
} from '@/shared/eagle/organize'
import { ORGANIZE_CONCURRENCY_DEFAULT } from '@/shared/eagle/organize'
import type { StoredEntity } from '@/shared/storage/types'
import fs from 'fs-extra'
import path from 'path'
import { dataPath } from '../../../common/storage/data-path'
import { DocumentStore } from '../../../common/storage/document-store'
import { EntityStore } from '../../../common/storage/entity-store'
import { StorageError } from '../../../common/storage/errors'
import { readJsonFile } from '../../../common/storage/json-file'

/** 并发池执行器 */
async function pMap<T, R>(
  items: T[],
  mapper: (item: T) => Promise<R>,
  concurrency = 32,
): Promise<R[]> {
  if (items.length === 0) return []
  const results: R[] = new Array(items.length)
  let index = 0
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (index < items.length) {
        const current = index++
        results[current] = await mapper(items[current])
      }
    },
  )
  await Promise.all(workers)
  return results
}

/**
 * 图片整理任务私有持久化（沿用 TaskRepository 模式）：
 * 复用通用存储引擎（原子写入 + 串行队列 + 损坏报错），
 * 但不注册到 storageRegistry，前端只能通过 /api/eagle/organize/* 专用接口访问。
 *
 * - 任务本体（task.json）：队列 itemIds 按处理顺序保存，上万条 id 体积可观，
 *   maxValueLength 放宽到 16M
 * - 单图结果（items/<itemId>.json）：执行完成时才落盘（懒创建），
 *   并在内存维护 itemsCache Map 索引，避免上万个小文件的全量遍历造成数秒 IO 阻塞
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
  private readonly itemsDir = dataPath('eagle', 'organize', 'items')

  private readonly taskStore = new DocumentStore<OrganizeTaskRecord>(
    dataPath('eagle', 'organize', 'task.json'),
    { maxValueLength: 16 * 1024 * 1024 },
  )

  private readonly itemStore = new EntityStore<
    OrganizeItemRecord,
    OrganizeItemSummary
  >(this.itemsDir)

  /** 任务文档内存缓存：加速 status/task/queue 等高频状态查询 */
  private taskCache: OrganizeTaskRecord | null = null
  private taskLoaded = false
  private loadTaskPromise: Promise<void> | null = null

  /** 内存索引与缓存：加速 queue/results/failed-items 等高频查询 */
  private readonly itemsCache = new Map<string, OrganizeItemRecord>()
  private cacheLoaded = false
  private loadCachePromise: Promise<void> | null = null

  /** 任务文档读改写的串行队列（tail 模式，与 ResourceLock 同思路） */
  private taskTail: Promise<unknown> = Promise.resolve()

  /** 确保任务文档已载入内存缓存 */
  private async ensureTaskLoaded(): Promise<void> {
    if (this.taskLoaded) return
    if (!this.loadTaskPromise) {
      this.loadTaskPromise = (async () => {
        try {
          const doc = await this.taskStore.get()
          const task = doc.value
          if (task) {
            this.taskCache = {
              ...task,
              folderId: task.folderId,
              folderName: task.folderName ?? '全部',
              successCount: task.successCount ?? 0,
              failedCount: task.failedCount ?? 0,
              concurrency: task.concurrency ?? ORGANIZE_CONCURRENCY_DEFAULT,
            }
          } else {
            this.taskCache = null
          }
          this.taskLoaded = true
        } finally {
          this.loadTaskPromise = null
        }
      })()
    }
    return this.loadTaskPromise
  }

  /** 确保内存缓存已初始化并从磁盘载入 */
  private async ensureCacheLoaded(): Promise<void> {
    if (this.cacheLoaded) return
    if (!this.loadCachePromise) {
      this.loadCachePromise = (async () => {
        try {
          const exists = await fs.pathExists(this.itemsDir)
          if (!exists) {
            await fs.ensureDir(this.itemsDir)
            this.cacheLoaded = true
            return
          }
          const files = await fs.readdir(this.itemsDir)
          const jsonFiles = files.filter((f) => f.endsWith('.json'))
          await pMap(
            jsonFiles,
            async (file) => {
              const filePath = path.join(this.itemsDir, file)
              try {
                const raw =
                  await readJsonFile<
                    StoredEntity<OrganizeItemRecord, OrganizeItemSummary>
                  >(filePath)
                if (raw && typeof raw === 'object' && 'value' in raw) {
                  const record = raw.value
                  if (record && typeof record === 'object' && record.itemId) {
                    this.itemsCache.set(record.itemId, record)
                  }
                }
              } catch (error) {
                // 单个文件异常记录警告并跳过，不阻塞其他数据
                console.warn(`[Eagle Organize] 加载结果缓存跳过异常文件: ${file}`, error)
              }
            },
            32,
          )
          this.cacheLoaded = true
        } finally {
          this.loadCachePromise = null
        }
      })()
    }
    return this.loadCachePromise
  }

  async getTask(): Promise<OrganizeTaskRecord | null> {
    await this.ensureTaskLoaded()
    return this.taskCache ? structuredClone(this.taskCache) : null
  }

  async saveTask(task: OrganizeTaskRecord): Promise<void> {
    const formattedTask: OrganizeTaskRecord = {
      ...task,
      folderId: task.folderId,
      folderName: task.folderName ?? '全部',
      successCount: task.successCount ?? 0,
      failedCount: task.failedCount ?? 0,
      concurrency: task.concurrency ?? ORGANIZE_CONCURRENCY_DEFAULT,
    }
    this.taskCache = structuredClone(formattedTask)
    this.taskLoaded = true
    await this.taskStore.replace(formattedTask)
  }

  /** 强制清空：删除任务文档（之后的 getTask 返回 null），结果实体由 clearItems 清理 */
  async deleteTask(): Promise<void> {
    this.taskCache = null
    this.taskLoaded = true
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
    await this.ensureCacheLoaded()
    const items = Array.from(this.itemsCache.values())
    return items
      .map((record) => ({
        itemId: record.itemId,
        status: record.status,
        folderPaths:
          record.folderPaths ?? (record.folderPath ? [record.folderPath] : []),
        updatedAt: record.updatedAt,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  async getItem(itemId: string): Promise<OrganizeItemRecord | null> {
    await this.ensureCacheLoaded()
    const cached = this.itemsCache.get(itemId)
    if (cached) return structuredClone(cached)

    try {
      const entity = await this.itemStore.get(itemId)
      if (entity?.value) {
        this.itemsCache.set(itemId, entity.value)
        return entity.value
      }
      return null
    } catch (error) {
      if (error instanceof StorageError && error.code === 'NOT_FOUND') {
        return null
      }
      throw error
    }
  }

  /** 落盘单图结果（首次懒创建；「重新执行」复写已有实体），同步更新内存缓存 */
  async saveItem(record: OrganizeItemRecord): Promise<void> {
    await this.ensureCacheLoaded()
    // 同步更新内存缓存，使后续查询立即可见（0ms）
    this.itemsCache.set(record.itemId, structuredClone(record))

    const summary: OrganizeItemSummary = {
      status: record.status,
      folderPaths:
        record.folderPaths ?? (record.folderPath ? [record.folderPath] : []),
    }
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

  /** 新任务创建前清空旧结果实体：清空内存缓存并批量快速清空磁盘目录 */
  async clearItems(): Promise<void> {
    this.itemsCache.clear()
    this.cacheLoaded = true
    if (await fs.pathExists(this.itemsDir)) {
      await fs.emptyDir(this.itemsDir)
    }
  }
}

/** 全局单例：service 与 executor 必须共用同一实例（mutateTask 串行语义） */
export const organizeRepository = new OrganizeRepository()
