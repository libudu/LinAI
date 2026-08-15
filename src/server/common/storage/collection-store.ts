import type {
  CollectionBatchOperation,
  StoredCollection,
  StoredItem,
} from '@/shared/storage/types'
import { randomUUID } from 'crypto'
import { StorageError } from './errors'
import { readJsonFile, writeJsonFile } from './json-file'
import { resourceLock } from './resource-lock'

const STORAGE_VERSION = 1

export interface CollectionStoreOptions<T> {
  /**
   * 旧格式迁移：读到非信封结构时调用，返回转换后的条目列表；
   * 返回 undefined 表示无法识别，按损坏处理
   */
  migrateLegacy?: (raw: unknown) => StoredItem<T>[]
  /** 单个 value 序列化后的最大字符数，默认 256K */
  maxValueLength?: number
  /** 每次成功落盘后回调（registry 用来接线 change bus） */
  onChange?: (change: { revision: number }) => void
}

const isEnvelope = (raw: unknown): raw is StoredCollection =>
  typeof raw === 'object' &&
  raw !== null &&
  !Array.isArray(raw) &&
  typeof (raw as StoredCollection).storageVersion === 'number' &&
  Array.isArray((raw as StoredCollection).items)

/**
 * 集合存储：小型 JSON 列表，整体保存在单个文件中。
 * - 所有写操作进入资源级串行队列，原子落盘
 * - 集合级 revision 单调递增，写操作可携带 expectedRevision 做并发冲突检测（409）
 * - 后端只管理信封字段，value 完全由前端定义
 */
export class CollectionStore<T = unknown> {
  constructor(
    readonly file: string,
    private readonly options: CollectionStoreOptions<T> = {},
  ) {}

  private async load(): Promise<StoredCollection<T>> {
    const raw = await readJsonFile<unknown>(this.file)
    if (raw === undefined) {
      // 文件不存在：空集合，revision 0 表示尚未落盘
      return {
        storageVersion: STORAGE_VERSION,
        revision: 0,
        updatedAt: 0,
        items: [],
      }
    }
    if (isEnvelope(raw)) return raw as StoredCollection<T>
    const migrated = this.options.migrateLegacy?.(raw)
    if (!migrated) {
      throw new StorageError(
        'CORRUPT',
        `无法识别的集合文件格式: ${this.file}`,
        {
          file: this.file,
        },
      )
    }
    return {
      storageVersion: STORAGE_VERSION,
      revision: 0,
      updatedAt: Date.now(),
      items: migrated,
    }
  }

  private assertRevision(
    data: StoredCollection<T>,
    expectedRevision?: number,
  ): void {
    if (expectedRevision !== undefined && expectedRevision !== data.revision) {
      throw new StorageError(
        'REVISION_CONFLICT',
        '数据已被其他页面修改，请刷新后重试',
        { currentRevision: data.revision },
      )
    }
  }

  private assertValueSize(value: T): void {
    const max = this.options.maxValueLength ?? 256 * 1024
    if (JSON.stringify(value)?.length > max) {
      throw new StorageError('PAYLOAD_TOO_LARGE', '单条数据超出大小限制', {
        maxValueLength: max,
      })
    }
  }

  private mutate<R>(
    fn: (data: StoredCollection<T>) => R,
    expectedRevision?: number,
  ): Promise<R> {
    return resourceLock.run(this.file, async () => {
      const data = await this.load()
      this.assertRevision(data, expectedRevision)
      const result = fn(data)
      data.revision += 1
      data.updatedAt = Date.now()
      await writeJsonFile(this.file, data)
      this.options.onChange?.({ revision: data.revision })
      return structuredClone(result)
    })
  }

  readonly getSnapshot = async (): Promise<StoredCollection<T>> => {
    return structuredClone(await this.load())
  }

  readonly create = (value: T, id?: string): Promise<StoredItem<T>> => {
    this.assertValueSize(value)
    return this.mutate((data) => {
      const now = Date.now()
      const item: StoredItem<T> = {
        id: id ?? randomUUID(),
        revision: 1,
        createdAt: now,
        updatedAt: now,
        value,
      }
      data.items.push(item)
      return item
    })
  }

  readonly replace = (
    id: string,
    value: T,
    expectedRevision?: number,
  ): Promise<StoredItem<T>> => {
    this.assertValueSize(value)
    return this.mutate((data) => {
      const item = data.items.find((i) => i.id === id)
      if (!item) {
        throw new StorageError('NOT_FOUND', `条目不存在: ${id}`)
      }
      item.value = value
      item.revision += 1
      item.updatedAt = Date.now()
      return item
    }, expectedRevision)
  }

  /**
   * 读改写在同一把资源锁内完成：fn 基于当前 value 计算新 value，
   * 适合后端拥有的数据做合并式更新（如任务状态流转）
   */
  readonly update = (
    id: string,
    fn: (value: T) => T,
    expectedRevision?: number,
  ): Promise<StoredItem<T>> => {
    return this.mutate((data) => {
      const item = data.items.find((i) => i.id === id)
      if (!item) {
        throw new StorageError('NOT_FOUND', `条目不存在: ${id}`)
      }
      const next = fn(structuredClone(item.value))
      this.assertValueSize(next)
      item.value = next
      item.revision += 1
      item.updatedAt = Date.now()
      return item
    }, expectedRevision)
  }

  readonly remove = (id: string, expectedRevision?: number): Promise<void> => {
    return this.mutate((data) => {
      const index = data.items.findIndex((i) => i.id === id)
      if (index === -1) {
        throw new StorageError('NOT_FOUND', `条目不存在: ${id}`)
      }
      data.items.splice(index, 1)
    }, expectedRevision)
  }

  /** 批量操作：整个批次在同一把资源锁内只写一次文件 */
  readonly batch = (
    operations: CollectionBatchOperation<T>[],
    expectedRevision?: number,
  ): Promise<void> => {
    for (const op of operations) {
      if (op.type !== 'delete') this.assertValueSize(op.value)
    }
    return this.mutate((data) => {
      const now = Date.now()
      for (const op of operations) {
        if (op.type === 'create') {
          data.items.push({
            id: op.id ?? randomUUID(),
            revision: 1,
            createdAt: now,
            updatedAt: now,
            value: op.value,
          })
        } else if (op.type === 'replace') {
          const item = data.items.find((i) => i.id === op.id)
          if (!item) {
            throw new StorageError('NOT_FOUND', `条目不存在: ${op.id}`)
          }
          item.value = op.value
          item.revision += 1
          item.updatedAt = now
        } else {
          const index = data.items.findIndex((i) => i.id === op.id)
          if (index === -1) {
            throw new StorageError('NOT_FOUND', `条目不存在: ${op.id}`)
          }
          data.items.splice(index, 1)
        }
      }
    }, expectedRevision)
  }
}
