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
import { resourceLock } from '../../../common/storage/resource-lock'
import { transitionTask } from './transitions'

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
  const settled = await Promise.allSettled(workers)
  const failed = settled.find((result) => result.status === 'rejected')
  if (failed?.status === 'rejected') throw failed.reason
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
  /** 首批图片来源文件夹 ID，仅保留历史信息，不限制后续追加 */
  folderId?: string
  /** 首批图片来源文件夹名称 */
  folderName?: string
  /** 处理队列：按创建时排序的图片 id */
  itemIds: string[]
  /** 已执行完成（success / failed / skipped / confirmed）的数量 */
  executed: number
  /** 待确认数量（仅 success 且未确认/未跳过） */
  pendingConfirm: number
  /** 本轮成功数，保留已确认/跳过的成功；重新执行会撤回上一轮成功，旧文档兜底为 0 */
  successCount: number
  /** 当前失败待处理数，旧文档兜底为 0 */
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
  private needsProgressReconcile = false

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
          const loadedItems = new Map<string, OrganizeItemRecord>()
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
                    loadedItems.set(record.itemId, record)
                  }
                }
              } catch (error) {
                if (
                  !(error instanceof StorageError) ||
                  error.code !== 'CORRUPT'
                )
                  throw error
                // 损坏文件隔离后跳过；读取失败不能伪装成结果缺失。
                console.warn(
                  `[Eagle Organize] 加载结果缓存跳过异常文件: ${file}`,
                  error,
                )
              }
            },
            32,
          )
          this.itemsCache.clear()
          for (const [id, record] of loadedItems)
            this.itemsCache.set(id, record)
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
      ...structuredClone(task),
      folderId: task.folderId,
      folderName: task.folderName ?? '全部',
      successCount: task.successCount ?? 0,
      failedCount: task.failedCount ?? 0,
      concurrency: task.concurrency ?? ORGANIZE_CONCURRENCY_DEFAULT,
    }
    await this.ensureTaskLoaded()
    await this.taskStore.replace(formattedTask)
    this.taskCache = formattedTask
    this.taskLoaded = true
  }

  /** 强制清空：删除任务文档（之后的 getTask 返回 null），结果实体由 clearItems 清理 */
  async deleteTask(): Promise<void> {
    await this.ensureTaskLoaded()
    try {
      await this.taskStore.remove()
    } catch (error) {
      // 删除主文件和备份不构成事务；部分删除后重新读实际剩余文档。
      this.taskLoaded = false
      throw error
    }
    this.taskCache = null
    this.taskLoaded = true
    this.needsProgressReconcile = false
  }

  /**
   * 任务文档的串行读改写：mutate 返回新记录则落盘并返回之，
   * 返回 null / 原对象则不写并返回 null（未发生变更）。
   * 服务与执行器所有任务状态变更必须经由此方法，避免并发覆盖 phase / 计数
   */
  async mutateTask(
    mutate: (
      task: OrganizeTaskRecord,
    ) => OrganizeTaskRecord | null | Promise<OrganizeTaskRecord | null>,
  ): Promise<OrganizeTaskRecord | null> {
    const run = async (): Promise<OrganizeTaskRecord | null> => {
      let task = await this.getTask()
      if (!task) return null
      // 上次实体或任务写盘失败可能只完成了一部分，下一次命令先按已落盘结果校准。
      if (this.needsProgressReconcile) {
        const reconciled = transitionTask(task, {
          type: 'reconcile',
          items: await this.getProgressItems(),
        })!
        await this.saveTask(reconciled)
        task = reconciled
        this.needsProgressReconcile = false
      }
      const next = await mutate(task)
      if (next && next !== task) {
        await this.saveTask(next)
        return next
      }
      return null
    }
    const result = this.taskTail.then(run, run)
    this.taskTail = result.catch(() => {
      this.needsProgressReconcile = true
    })
    return result
  }

  /** 重放已确认项等幂等命令也先修复上一次部分写盘留下的计数。 */
  async reconcileTaskIfNeeded(): Promise<void> {
    if (this.needsProgressReconcile) await this.mutateTask(() => null)
  }

  async listItems(): Promise<
    Array<{ itemId: string } & OrganizeItemSummary & { updatedAt: number }>
  > {
    await this.ensureCacheLoaded()
    const items = Array.from(this.itemsCache.values())
    // 列表摘要包含 folderPaths 与 lowQuality，支持前端无需拉取详情即可完成分类分组与低质置顶排序
    return items
      .map((record) => ({
        itemId: record.itemId,
        status: record.status,
        folderPaths: [
          ...(record.folderPaths ??
            (record.folderPath ? [record.folderPath] : [])),
        ],
        lowQuality: record.lowQuality,
        updatedAt: record.updatedAt,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  /** 收尾校准所需的轻量快照，保留标题以识别已跳过的成功项，不排序。 */
  async getProgressItems() {
    await this.ensureCacheLoaded()
    return Array.from(
      this.itemsCache.values(),
      ({ itemId, status, title }) => ({
        itemId,
        status,
        title,
      }),
    )
  }

  async getItem(itemId: string): Promise<OrganizeItemRecord | null> {
    await this.ensureCacheLoaded()
    const cached = this.itemsCache.get(itemId)
    if (cached) return structuredClone(cached)

    try {
      const entity = await this.itemStore.get(itemId)
      if (entity?.value) {
        this.itemsCache.set(itemId, entity.value)
        return structuredClone(entity.value)
      }
      return null
    } catch (error) {
      if (error instanceof StorageError && error.code === 'NOT_FOUND') {
        return null
      }
      throw error
    }
  }

  /** 单张和批量共用实体保存：写盘成功后才发布独立缓存快照。 */
  private async persistItem(record: OrganizeItemRecord): Promise<void> {
    const snapshot = structuredClone(record)
    await resourceLock.run(
      `eagle.organize:item:${snapshot.itemId}`,
      async () => {
        const summary: OrganizeItemSummary = {
          status: snapshot.status,
          folderPaths:
            snapshot.folderPaths ??
            (snapshot.folderPath ? [snapshot.folderPath] : []),
          lowQuality: snapshot.lowQuality,
        }
        try {
          await this.itemStore.create(snapshot, summary, snapshot.itemId)
        } catch (error) {
          if (
            !(error instanceof StorageError) ||
            error.code !== 'REVISION_CONFLICT'
          )
            throw error
          await this.itemStore.replace(snapshot.itemId, snapshot, summary)
        }
        this.itemsCache.set(snapshot.itemId, snapshot)
      },
    )
  }

  async saveItem(record: OrganizeItemRecord): Promise<void> {
    await this.ensureCacheLoaded()
    await this.persistItem(record)
  }

  /**
   * 批量独立写盘，保留 16 并发。等待全部条目结束后抛出首个错误，
   * 成功项逐项发布缓存，失败项保留原值；不承诺多实体事务。
   */
  async saveItemsBatch(records: OrganizeItemRecord[]): Promise<void> {
    if (records.length === 0) return
    await this.ensureCacheLoaded()
    const errors: unknown[] = []
    // 同批重复 ID 以最后一份为准，避免同一实体的无意义并发覆盖。
    const unique = [
      ...new Map(records.map((record) => [record.itemId, record])).values(),
    ]
    await pMap(
      unique,
      async (record) => {
        try {
          await this.persistItem(record)
        } catch (error) {
          errors.push(error)
        }
      },
      16,
    )
    if (errors.length > 0) throw errors[0]
  }

  /** 调用方先等待执行器退出；目录清空成功后才发布空缓存。 */
  async clearItems(): Promise<void> {
    await this.ensureCacheLoaded()
    try {
      if (await fs.pathExists(this.itemsDir)) await fs.emptyDir(this.itemsDir)
    } catch (error) {
      // emptyDir 可能已删掉部分实体，丢弃旧缓存，后续查询重新加载实际文件。
      this.itemsCache.clear()
      this.cacheLoaded = false
      this.needsProgressReconcile = true
      throw error
    }
    this.itemsCache.clear()
    this.cacheLoaded = true
  }
}

/** 全局单例：service 与 executor 必须共用同一实例（mutateTask 串行语义） */
export const organizeRepository = new OrganizeRepository()
