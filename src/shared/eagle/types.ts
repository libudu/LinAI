// Eagle 图片管理模块共享类型（前后端共用，无 UI / Node 依赖）

export interface EagleFolder {
  id: string
  name: string
  /** 文件夹描述（Eagle 库 metadata.json 中的 description 字段） */
  description: string
  children: EagleFolder[]
  /** 直接包含的资源数 */
  count: number
  /** 含子孙文件夹的累计数 */
  totalCount: number
}

export interface EagleItem {
  id: string
  name: string
  ext: string
  size: number
  width: number
  height: number
  /** 文件修改时间（排序依据） */
  mtime: number
  isVideo: boolean
  isGif: boolean
  hasThumbnail: boolean
}

export interface EagleItemsResp {
  total: number
  items: EagleItem[]
}

export type EagleSortBy = 'mtime' | 'size'
export type EagleSortOrder = 'asc' | 'desc'
