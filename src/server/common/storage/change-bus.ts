import { EventEmitter } from 'events'

/**
 * 资源变更信息：只携带版本与位置信息，不携带数据本体，
 * 前端收到后按需重新读取（见 /api/storage/events）
 */
export interface ResourceChange {
  resource: string
  /** 集合级 revision；EntityStore 为实体 revision */
  revision?: number
  /** 实体资源变更时的实体 ID */
  entityId?: string
}

type ChangeListener = (change: ResourceChange) => void

/**
 * 统一资源变更总线：通用存储（CollectionStore/EntityStore 经 storageRegistry 接线）
 * 与后端专用服务（如 TaskService）在同一总线上发布变更。
 * 只有登记过的资源 ID 可订阅，避免 SSE 泄露未公开资源的存在性。
 */
class ChangeBus {
  private readonly emitter = new EventEmitter()
  private readonly known = new Set<string>()

  constructor() {
    // 订阅者数量随 SSE 连接数变化，不做默认上限
    this.emitter.setMaxListeners(0)
  }

  /** 登记可订阅的资源 ID（storageRegistry 注册资源、后端专用服务启动时调用） */
  register(resource: string): void {
    this.known.add(resource)
  }

  has(resource: string): boolean {
    return this.known.has(resource)
  }

  publish(change: ResourceChange): void {
    this.emitter.emit(change.resource, change)
  }

  /** 订阅资源变更，返回取消订阅函数 */
  subscribe(resource: string, listener: ChangeListener): () => void {
    this.emitter.on(resource, listener)
    return () => {
      this.emitter.off(resource, listener)
    }
  }
}

export const changeBus = new ChangeBus()
