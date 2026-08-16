import type { StoredDocument } from '@/shared/storage/types'
import { StorageError } from './errors'
import { readJsonFile, writeJsonFile } from './json-file'
import { resourceLock } from './resource-lock'

const STORAGE_VERSION = 1

export interface DocumentStoreOptions<T> {
  /**
   * 旧格式迁移：读到非信封结构时调用，返回转换后的 value；
   * 返回 undefined 表示无法识别，按损坏处理
   */
  migrateLegacy?: (raw: unknown) => T
  /** value 序列化后的最大字符数，默认 256K */
  maxValueLength?: number
  /** 每次成功落盘后回调（settingsRegistry 用来接线 change bus） */
  onChange?: (change: { revision: number }) => void
}

const isEnvelope = (raw: unknown): raw is StoredDocument =>
  typeof raw === 'object' &&
  raw !== null &&
  !Array.isArray(raw) &&
  typeof (raw as StoredDocument).storageVersion === 'number' &&
  'value' in (raw as StoredDocument)

/**
 * 单文档存储：模块设置等单对象 JSON。
 * - 写操作进入资源级串行队列，原子落盘
 * - revision 单调递增，写操作可携带 expectedRevision 做并发冲突检测（409）
 * - 整体替换语义：不做浅层 PATCH，字段删除以提交内容为准
 */
export class DocumentStore<T = unknown> {
  constructor(
    readonly file: string,
    private readonly options: DocumentStoreOptions<T> = {},
  ) {}

  /** 文件不存在返回 undefined（由调用方决定默认值策略） */
  private async load(): Promise<StoredDocument<T> | undefined> {
    const raw = await readJsonFile<unknown>(this.file)
    if (raw === undefined) return undefined
    if (isEnvelope(raw)) return raw as StoredDocument<T>
    const migrated = this.options.migrateLegacy?.(raw)
    if (migrated === undefined) {
      throw new StorageError(
        'CORRUPT',
        `无法识别的文档文件格式: ${this.file}`,
        {
          file: this.file,
        },
      )
    }
    return {
      storageVersion: STORAGE_VERSION,
      revision: 0,
      updatedAt: Date.now(),
      value: migrated,
    }
  }

  private assertValueSize(value: T): void {
    const max = this.options.maxValueLength ?? 256 * 1024
    if (JSON.stringify(value)?.length > max) {
      throw new StorageError('PAYLOAD_TOO_LARGE', '文档超出大小限制', {
        maxValueLength: max,
      })
    }
  }

  /** 读取文档；文件不存在时返回 revision 0 的空信封（value 为 undefined） */
  readonly get = async (): Promise<StoredDocument<T | undefined>> => {
    const doc = await this.load()
    return structuredClone(
      doc ?? {
        storageVersion: STORAGE_VERSION,
        revision: 0,
        updatedAt: 0,
        value: undefined,
      },
    )
  }

  /** 整体替换；expectedRevision 不匹配抛 REVISION_CONFLICT */
  readonly replace = (
    value: T,
    expectedRevision?: number,
  ): Promise<StoredDocument<T>> => {
    this.assertValueSize(value)
    return resourceLock.run(this.file, async () => {
      const doc = await this.load()
      const revision = doc?.revision ?? 0
      if (expectedRevision !== undefined && expectedRevision !== revision) {
        throw new StorageError(
          'REVISION_CONFLICT',
          '数据已被其他页面修改，请刷新后重试',
          { currentRevision: revision },
        )
      }
      const next: StoredDocument<T> = {
        storageVersion: STORAGE_VERSION,
        revision: revision + 1,
        updatedAt: Date.now(),
        value,
      }
      await writeJsonFile(this.file, next)
      this.options.onChange?.({ revision: next.revision })
      return structuredClone(next)
    })
  }
}
