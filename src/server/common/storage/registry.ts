import type { StoredItem } from '@/shared/storage/types'
import { changeBus } from './change-bus'
import { CollectionStore, CollectionStoreOptions } from './collection-store'
import { EntityStore, EntityStoreOptions } from './entity-store'
import { StorageError } from './errors'

/**
 * 存储资源注册表：把公开资源 ID 映射到固定存储位置和驱动。
 * 客户端只能传资源 ID（如 image.templates），不能传真实文件路径，
 * 未注册的 ID 直接拒绝，从根上避免路径注入。
 */

export interface CollectionResourceDef<T = unknown> {
  kind: 'collection'
  /** 磁盘文件位置（服务端固定，不来自客户端） */
  file: string
  /** 旧格式迁移，见 CollectionStoreOptions */
  migrateLegacy?: (raw: unknown) => StoredItem<T>[]
}

export interface EntityResourceDef<T = unknown, S = unknown> {
  kind: 'entity'
  /** 实体目录（服务端固定，不来自客户端），每个实体一个 <id>.json */
  dir: string
  /** 旧格式一次性迁移，见 EntityStoreOptions */
  migrateLegacy?: EntityStoreOptions<T, S>['migrateLegacy']
  /** 单个 value 序列化后的最大字符数，见 EntityStoreOptions */
  maxValueLength?: number
}

export type StorageResourceDef = CollectionResourceDef | EntityResourceDef

// 资源 ID 形如 image.templates：小写段以点分隔
const RESOURCE_ID_PATTERN = /^[a-z0-9]+(\.[a-z0-9-]+)*$/

class StorageRegistry {
  private readonly defs = new Map<string, StorageResourceDef>()
  private readonly stores = new Map<
    string,
    CollectionStore<unknown> | EntityStore<unknown, unknown>
  >()

  register(id: string, def: StorageResourceDef): void {
    if (!RESOURCE_ID_PATTERN.test(id)) {
      throw new Error(`[storage] 非法资源 ID: ${id}`)
    }
    if (this.defs.has(id)) {
      throw new Error(`[storage] 重复注册资源: ${id}`)
    }
    this.defs.set(id, def)
    // 登记为可订阅的变更资源（/api/storage/events）
    changeBus.register(id)
  }

  getCollection<T>(id: string): CollectionStore<T> {
    const def = this.defs.get(id)
    if (!def || def.kind !== 'collection') {
      throw new StorageError('INVALID_RESOURCE', `未注册的存储资源: ${id}`)
    }
    let store = this.stores.get(id)
    if (!store) {
      const options: CollectionStoreOptions<unknown> = {
        migrateLegacy: def.migrateLegacy,
        onChange: (change) => changeBus.publish({ resource: id, ...change }),
      }
      store = new CollectionStore(def.file, options)
      this.stores.set(id, store)
    }
    return store as CollectionStore<T>
  }

  getEntity<T, S>(id: string): EntityStore<T, S> {
    const def = this.defs.get(id)
    if (!def || def.kind !== 'entity') {
      throw new StorageError('INVALID_RESOURCE', `未注册的存储资源: ${id}`)
    }
    let store = this.stores.get(id)
    if (!store) {
      const options: EntityStoreOptions<unknown, unknown> = {
        migrateLegacy: def.migrateLegacy,
        maxValueLength: def.maxValueLength,
        onChange: (change) => changeBus.publish({ resource: id, ...change }),
      }
      store = new EntityStore(def.dir, options)
      this.stores.set(id, store)
    }
    return store as EntityStore<T, S>
  }
}

export const storageRegistry = new StorageRegistry()
