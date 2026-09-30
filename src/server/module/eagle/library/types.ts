/** Eagle 库原始结构、内部索引结构与业务参数；无运行时副作用。 */
import type { EagleSortBy, EagleSortOrder } from '@/shared/eagle/types'

// ---- Eagle 库内原始数据结构 ----

/** Eagle 库根 metadata.json 中记录的原始文件夹节点 */
export interface EagleRawFolder {
  id: string
  name: string
  description?: string
  children?: EagleRawFolder[]
}

/** Eagle 各条目 images/<id>.info/metadata.json 中的原始条目元数据 */
export interface EagleRawItemMeta {
  id: string
  name: string
  ext: string
  size: number
  width?: number
  height?: number
  mtime: number
  lastModified: number
  folders?: string[]
  isDeleted?: boolean
}

// ---- 索引条目（持久化到 data/eagle/index-shards/） ----

/** 内存索引与本地缓存中的条目，避免高频 I/O 读磁盘 metadata.json 与 readdir 探测文件名 */
export interface EagleItemIndex {
  id: string
  name: string
  ext: string
  size: number
  width: number
  height: number
  mtime: number
  lastModified: number
  folders: string[]
  /** 原文件名（含扩展名，如 image.png） */
  fileName: string
  /** 库内预生成的缩略图文件名，不存在为 null */
  thumbnailName: string | null
  /** 是否已移入回收站（Eagle 软删除标记） */
  isDeleted?: boolean
}

/** Eagle 内存索引运行期状态 */
export interface EagleIndexState {
  libraryPath: string
  folders: EagleRawFolder[]
  items: Map<string, EagleItemIndex>
}

/** 整理列表所需的独立只读摘要，不包含索引的可变数组。 */
export type EagleItemSnapshot = Readonly<
  Pick<EagleItemIndex, 'name' | 'mtime' | 'width' | 'height' | 'size'>
>

/** 获取条目列表的分页与排序参数 */
export interface GetItemsParams {
  folderId?: string
  sortBy: EagleSortBy
  sortOrder: EagleSortOrder
  offset: number
  limit: number
}

/** 编辑条目的增量补丁数据 */
export interface UpdateItemPatch {
  /** 新标题（同时重命名 .info 内原文件与缩略图）；缺省不改名 */
  name?: string
  /** 目标文件夹 id 列表（替换 folders，可传空数组清除分类）；缺省不改动 */
  folderIds?: string[]
  /** 是否移出/移入回收站 */
  isDeleted?: boolean
}

/** 分片索引元数据文件结构 (data/eagle/index-shards/meta.json) */
export interface EagleIndexShardMeta {
  libraryPath: string
  scannedAt: number
  shardCount: number
}
