// 通用存储信封与批量操作类型（前后端共享）
// 信封字段（id/revision/createdAt/updatedAt）由后端管理，value 完全由前端定义

export interface StoredItem<T = unknown> {
  id: string
  /** 条目版本，每次修改递增，仅用于展示与调试 */
  revision: number
  createdAt: number
  updatedAt: number
  value: T
}

/** 集合资源的磁盘/传输结构；revision 为集合级版本，每次写入递增，用于并发冲突检测 */
export interface StoredCollection<T = unknown> {
  storageVersion: number
  revision: number
  updatedAt: number
  items: StoredItem<T>[]
}

export type CollectionBatchOperation<T = unknown> =
  | { type: 'create'; value: T; id?: string }
  | { type: 'replace'; id: string; value: T }
  | { type: 'delete'; id: string }

/**
 * 实体资源的磁盘/传输结构：每个实体单独一个文件。
 * summary 由前端随写入一并提供，列表接口只返回摘要，无需加载 value 正文
 */
export interface StoredEntity<T = unknown, S = unknown> {
  storageVersion: number
  id: string
  /** 实体版本，每次写入递增，用于并发冲突检测（expectedRevision） */
  revision: number
  createdAt: number
  updatedAt: number
  summary: S
  value: T
}

/** 实体列表接口返回的摘要项（不含 value） */
export interface StoredEntitySummary<S = unknown> {
  id: string
  revision: number
  createdAt: number
  updatedAt: number
  summary: S
}
