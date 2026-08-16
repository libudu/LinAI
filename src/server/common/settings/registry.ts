import { z } from 'zod'
import { changeBus } from '../storage/change-bus'
import { DocumentStore } from '../storage/document-store'
import { StorageError } from '../storage/errors'

/**
 * 注册式设置服务（§7.3）：后端会消费的配置（API Key、Base URL、模型 ID 等）
 * 集中注册 schema 与默认值，通用路由 GET/PUT /api/settings/:id 只实现一次。
 * - 存储底层为 DocumentStore（原子写入 + 串行队列 + revision 冲突检测）
 * - 变更发布到 change bus 的 `settings.<id>` 资源
 * - 本应用前后端均在用户本地，密钥明文回传，方便用户查看与复制
 */

export interface SettingsDef<T> {
  /** 磁盘文件位置（服务端固定，不来自客户端） */
  file: string
  /** 默认值：文件缺失/字段缺失时回退 */
  defaults: T
  /** 整体 value 的 zod schema（唯一字段定义来源，接口层不再重复） */
  schema: z.ZodType<T>
  /** 旧格式迁移：读到非信封结构时调用，返回 value；缺省则要求文件已是信封 */
  migrateLegacy?: (raw: unknown) => T
  /** 文件完全不存在时的兜底来源（如更旧的全局 data/config.json），返回挑选出的部分字段 */
  loadLegacy?: () => Partial<T> | Promise<Partial<T>>
}

// 设置 ID 形如 gpt-image：小写字母数字与中划线
const SETTINGS_ID_PATTERN = /^[a-z0-9-]+$/

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** 旧扁平配置迁移辅助：非对象抛错后返回记录，供各模块整体转换或挑字段 */
export const asLegacyRecord = (raw: unknown): Record<string, unknown> => {
  if (!isPlainObject(raw)) {
    throw new Error('旧配置文件不是对象')
  }
  return raw
}

/** 旧扁平配置迁移工厂：非对象抛错 + 只挑已知字段 */
export const pickLegacyFields =
  <T>(knownKeys: readonly string[]) =>
  (raw: unknown): T => {
    const record = asLegacyRecord(raw)
    const picked: Record<string, unknown> = {}
    for (const key of knownKeys) {
      if (record[key] !== undefined) picked[key] = record[key]
    }
    return picked as T
  }

// 深合并默认值：只补齐缺失字段，已有的值（含数组与 null）以提交/文件为准
const mergeDefaults = <T>(defaults: T, loaded: unknown): T => {
  if (!isPlainObject(loaded)) return structuredClone(defaults)
  const result: Record<string, unknown> = { ...loaded }
  for (const [key, defaultValue] of Object.entries(
    defaults as Record<string, unknown>,
  )) {
    const loadedValue = loaded[key]
    if (loadedValue === undefined) {
      result[key] = defaultValue
    } else if (isPlainObject(defaultValue) && isPlainObject(loadedValue)) {
      result[key] = mergeDefaults(defaultValue, loadedValue)
    }
  }
  return result as T
}

export interface SettingsSnapshot<T> {
  revision: number
  value: T
}

class SettingsRegistry {
  private readonly defs = new Map<string, SettingsDef<unknown>>()
  private readonly stores = new Map<string, DocumentStore<unknown>>()

  register<T>(id: string, def: SettingsDef<T>): void {
    if (!SETTINGS_ID_PATTERN.test(id)) {
      throw new Error(`[settings] 非法设置 ID: ${id}`)
    }
    if (this.defs.has(id)) {
      throw new Error(`[settings] 重复注册设置: ${id}`)
    }
    this.defs.set(id, def as SettingsDef<unknown>)
    // 登记为可订阅的变更资源（/api/storage/events）
    changeBus.register(`settings.${id}`)
  }

  private entry<T>(id: string): {
    def: SettingsDef<T>
    store: DocumentStore<T>
  } {
    const def = this.defs.get(id)
    if (!def) {
      throw new StorageError('INVALID_RESOURCE', `未注册的设置: ${id}`)
    }
    let store = this.stores.get(id)
    if (!store) {
      store = new DocumentStore(def.file, {
        migrateLegacy: def.migrateLegacy,
        onChange: (change) =>
          changeBus.publish({ resource: `settings.${id}`, ...change }),
      })
      this.stores.set(id, store)
    }
    return { def: def as SettingsDef<T>, store: store as DocumentStore<T> }
  }

  /** 读取：合并默认值后的完整值（服务端内部与接口层共用） */
  async get<T>(id: string): Promise<SettingsSnapshot<T>> {
    const { def, store } = this.entry<T>(id)
    const doc = await store.get()
    let raw = doc.value
    if (raw === undefined && def.loadLegacy) {
      raw = mergeDefaults(def.defaults, await def.loadLegacy())
    }
    return { revision: doc.revision, value: mergeDefaults(def.defaults, raw) }
  }

  /**
   * 写入：合并默认值 → schema 校验 → 整体替换落盘。
   * expectedRevision 不匹配抛 REVISION_CONFLICT（409）
   */
  async put<T>(
    id: string,
    incoming: unknown,
    expectedRevision?: number,
  ): Promise<SettingsSnapshot<T>> {
    const { def, store } = this.entry<T>(id)
    const value = def.schema.parse(mergeDefaults(def.defaults, incoming))
    const doc = await store.replace(value, expectedRevision)
    return { revision: doc.revision, value: doc.value }
  }
}

export const settingsRegistry = new SettingsRegistry()
