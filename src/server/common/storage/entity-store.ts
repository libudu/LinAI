import type { StoredEntity, StoredEntitySummary } from '@/shared/storage/types'
import { randomUUID } from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { StorageError } from './errors'
import { readJsonFile, toCorrupt, writeJsonFile } from './json-file'
import { resourceLock } from './resource-lock'

const STORAGE_VERSION = 1

export interface EntityStoreOptions<T, S> {
  /**
   * 旧格式一次性迁移：目标目录不存在时调用，返回转换后的实体列表并逐个落盘；
   * 单个实体迁移失败应跳过并记录日志，不影响其余实体
   */
  migrateLegacy?: () => Promise<StoredEntity<T, S>[]>
  /** 单个 value 序列化后的最大字符数，默认 8M（实体含正文，比集合条目大得多） */
  maxValueLength?: number
  /** 每次成功落盘后回调（registry 用来接线 change bus） */
  onChange?: (change: { entityId: string; revision?: number }) => void
}

// 实体 ID 直接拼成文件名，必须严格限制字符集，杜绝路径穿越
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

const isEnvelope = (raw: unknown): raw is StoredEntity =>
  typeof raw === 'object' &&
  raw !== null &&
  !Array.isArray(raw) &&
  typeof (raw as StoredEntity).storageVersion === 'number' &&
  typeof (raw as StoredEntity).id === 'string' &&
  typeof (raw as StoredEntity).revision === 'number' &&
  'value' in (raw as StoredEntity)

/**
 * 实体存储：每个实体独立保存一个 JSON 文件（dir/<id>.json）。
 * - 新增/删除走集合级锁（影响列表成员），修改走实体级锁，全部原子落盘
 * - revision 单调递增，replace 可携带 expectedRevision 做并发冲突检测（409）
 * - 列表只返回 summary，不加载 value 正文；后端只管理信封字段
 */
export class EntityStore<T = unknown, S = unknown> {
  /** 一次性迁移单飞 Promise：所有方法先 await 它，保证迁移完成后才开始读写 */
  private readyPromise: Promise<void> | null = null

  constructor(
    readonly dir: string,
    private readonly options: EntityStoreOptions<T, S> = {},
  ) {}

  private assertId(id: string): void {
    if (!ID_PATTERN.test(id)) {
      throw new StorageError('NOT_FOUND', `实体不存在: ${id}`)
    }
  }

  private fileOf(id: string): string {
    this.assertId(id)
    return path.join(this.dir, `${id}.json`)
  }

  private ensureReady(): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = (async () => {
        const exists = await fs
          .stat(this.dir)
          .then((s) => s.isDirectory())
          .catch(() => false)
        if (!exists && this.options.migrateLegacy) {
          const entities = await this.options.migrateLegacy()
          for (const entity of entities) {
            try {
              await writeJsonFile(this.fileOf(entity.id), entity)
            } catch (error) {
              // 旧文件 id 含非法字符（assertId 抛 NOT_FOUND）时跳过该实体，不中断整个迁移
              if (error instanceof StorageError && error.code === 'NOT_FOUND') {
                console.warn(`[storage] 迁移跳过非法实体 id: ${entity.id}`)
                continue
              }
              throw error
            }
          }
        }
        await fs.mkdir(this.dir, { recursive: true })
      })()
      // 失败时重置缓存，允许后续调用重试，而不是永久缓存 rejected Promise
      this.readyPromise.catch(() => {
        this.readyPromise = null
      })
    }
    return this.readyPromise
  }

  private assertValueSize(value: T): void {
    const max = this.options.maxValueLength ?? 8 * 1024 * 1024
    if (JSON.stringify(value)?.length > max) {
      throw new StorageError('PAYLOAD_TOO_LARGE', '单个实体超出大小限制', {
        maxValueLength: max,
      })
    }
  }

  private async readEntity(id: string): Promise<StoredEntity<T, S>> {
    const file = this.fileOf(id)
    const raw = await readJsonFile<unknown>(file)
    if (raw === undefined) {
      throw new StorageError('NOT_FOUND', `实体不存在: ${id}`)
    }
    if (!isEnvelope(raw)) {
      throw new StorageError('CORRUPT', `无法识别的实体文件格式: ${file}`, {
        file,
      })
    }
    return raw as StoredEntity<T, S>
  }

  /** 读取目录下全部实体文件（.bak / .corrupt-* / 临时文件天然被 .json 后缀过滤） */
  private async readAll(): Promise<StoredEntity<T, S>[]> {
    await this.ensureReady()
    const files = await fs.readdir(this.dir)
    const entities: StoredEntity<T, S>[] = []
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      const filePath = path.join(this.dir, file)
      let raw: unknown
      try {
        raw = await readJsonFile<unknown>(filePath)
      } catch (error) {
        // 单个文件损坏（readJsonFile 已将其改名为 .corrupt）：警告并跳过，不影响其余实体
        if (error instanceof StorageError && error.code === 'CORRUPT') {
          console.warn(`[storage] 跳过损坏的实体文件: ${filePath}`)
          continue
        }
        throw error
      }
      if (raw === undefined) continue
      if (!isEnvelope(raw)) {
        // 能解析但不是信封结构：同样隔离为 .corrupt 并跳过
        toCorrupt(filePath, new Error('无法识别的实体文件格式'))
        console.warn(`[storage] 跳过损坏的实体文件: ${filePath}`)
        continue
      }
      entities.push(raw as StoredEntity<T, S>)
    }
    return entities.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  /** 摘要列表（按 updatedAt 倒序），不返回 value 正文 */
  readonly list = async (): Promise<StoredEntitySummary<S>[]> => {
    const entities = await this.readAll()
    return entities.map(
      ({ id, revision, createdAt, updatedAt, summary, value }) => {
        let finalSummary = summary
        if (
          summary &&
          typeof summary === 'object' &&
          !('folderPaths' in summary) &&
          value &&
          typeof value === 'object'
        ) {
          const v = value as { folderPaths?: string[]; folderPath?: string }
          if (v.folderPaths || v.folderPath) {
            finalSummary = {
              ...summary,
              folderPaths:
                v.folderPaths ?? (v.folderPath ? [v.folderPath] : []),
            }
          }
        }
        return {
          id,
          revision,
          createdAt,
          updatedAt,
          summary: finalSummary,
        }
      },
    )
  }

  readonly get = async (id: string): Promise<StoredEntity<T, S>> => {
    await this.ensureReady()
    return structuredClone(await this.readEntity(id))
  }

  readonly create = async (
    value: T,
    summary: S,
    id?: string,
  ): Promise<StoredEntity<T, S>> => {
    this.assertValueSize(value)
    await this.ensureReady()
    const entityId = id ?? randomUUID()
    // 新增影响列表成员，使用集合级锁
    return resourceLock.run(this.dir, async () => {
      const file = this.fileOf(entityId)
      const existing = await readJsonFile<unknown>(file)
      if (existing !== undefined) {
        throw new StorageError('REVISION_CONFLICT', `实体已存在: ${entityId}`)
      }
      const now = Date.now()
      const entity: StoredEntity<T, S> = {
        storageVersion: STORAGE_VERSION,
        id: entityId,
        revision: 1,
        createdAt: now,
        updatedAt: now,
        summary,
        value,
      }
      await writeJsonFile(file, entity)
      this.options.onChange?.({ entityId, revision: entity.revision })
      return structuredClone(entity)
    })
  }

  readonly replace = async (
    id: string,
    value: T,
    summary: S,
    expectedRevision?: number,
  ): Promise<StoredEntity<T, S>> => {
    this.assertValueSize(value)
    await this.ensureReady()
    // 实体级锁：同一实体的读改写串行
    return resourceLock.run(this.fileOf(id), async () => {
      const entity = await this.readEntity(id)
      if (
        expectedRevision !== undefined &&
        expectedRevision !== entity.revision
      ) {
        throw new StorageError(
          'REVISION_CONFLICT',
          '数据已被其他页面修改，请刷新后重试',
          { currentRevision: entity.revision },
        )
      }
      entity.value = value
      entity.summary = summary
      entity.revision += 1
      entity.updatedAt = Date.now()
      await writeJsonFile(this.fileOf(id), entity)
      this.options.onChange?.({ entityId: id, revision: entity.revision })
      return structuredClone(entity)
    })
  }

  readonly remove = async (id: string): Promise<void> => {
    await this.ensureReady()
    // 删除影响列表成员，使用集合级锁（与 create 一致）
    return resourceLock.run(this.dir, async () => {
      await this.readEntity(id) // 不存在抛 NOT_FOUND
      await fs.rm(this.fileOf(id), { force: true })
      // 连带清理写入时留下的 .bak 备份，避免成为孤儿文件
      await fs.rm(`${this.fileOf(id)}.bak`, { force: true })
      this.options.onChange?.({ entityId: id })
    })
  }
}
