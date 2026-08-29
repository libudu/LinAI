/**
 * Eagle 资源库数据类型、常量与基础辅助函数。
 *
 * 包含：
 * - Eagle 库内原始 JSON 结构定义（EagleRawFolder / EagleRawItemMeta）
 * - 内存索引与持久化缓存条目定义（EagleItemIndex / EagleIndexCacheFile / EagleIndexState）
 * - 核心参数接口与全局常量配置（视频扩展名集合、ID 格式校验、扫描并发度、路径辅助等）
 */

import type { EagleSortBy, EagleSortOrder } from '@/shared/eagle/types'
import path from 'path'
import { changeBus } from '../../../common/storage/change-bus'
import { dataPath } from '../../../common/storage/data-path'

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

export type EagleItemMeta = EagleRawItemMeta

// ---- 索引条目（持久化到 data/eagle/index.json） ----

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

/** 本地持久化的索引缓存文件结构 (data/eagle/index.json) */
export interface EagleIndexCacheFile {
  libraryPath: string
  scannedAt: number
  items: EagleItemIndex[]
}

/** Eagle 内存索引运行期状态 */
export interface EagleIndexState {
  libraryPath: string
  folders: EagleRawFolder[]
  items: Map<string, EagleItemIndex>
}

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

// ---- 常量与路径 ----

/** 支持通过 HTML5 video 播放的视频扩展名集合 */
export const VIDEO_EXTS = new Set([
  'mp4',
  'webm',
  'mov',
  'avi',
  'mkv',
  'flv',
  'm4v',
])

/** Eagle 条目唯一标识格式正则（字母数字组成） */
export const ITEM_ID_PATTERN = /^[A-Za-z0-9]+$/

/** fs.watch 监听防抖时间（毫秒） */
export const WATCH_DEBOUNCE_MS = 500

/** 全量扫描时并发读 metadata.json 的并发度 */
export const SCAN_CONCURRENCY = 32

/** 本地索引缓存与自生缩略图缓存路径 */
export const CACHE_FILE = dataPath('eagle', 'index.json')
export const THUMB_DIR = dataPath('eagle', 'thumb')

/** 库内容变更（updateItem/deleteItem 等写库后发布），前端订阅后刷新文件夹树与列表 */
export const EAGLE_LIBRARY_RESOURCE = 'eagle.library'
changeBus.register(EAGLE_LIBRARY_RESOURCE)

// ---- 基础工具函数 ----

/** 获取指定 Eagle 库下的 images 目录绝对路径 */
export const imagesDir = (libraryPath: string) =>
  path.join(libraryPath, 'images')

/** 判断指定扩展名是否属于视频文件 */
export const isVideoExt = (ext: string) => VIDEO_EXTS.has(ext)

/** 条目名即文件名：去掉 Windows 文件名非法字符与首尾空白/点号，限制最大长度 120 字符 */
export const sanitizeItemName = (name: string): string =>
  name
    .replace(/[\\/:*?"<>|\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s.]+$/, '')
    .slice(0, 120)
    .trim()
