/**
 * Eagle 资源库内存查询与数据视图投影。
 *
 * 包含：
 * - 索引条目向前端 EagleItem 的转换投影；
 * - 文件夹树构造与直接图片数 / 子孙递归总数（totalCount）统计；
 * - 服务端条目分页、排序与虚拟文件夹过滤（未分类、回收站）；
 * - 图片整理专项查询：
 *   - 有描述文件夹转分类标准（后序遍历保证子分类优先级高、父分类兜底）；
 *   - 分类范围可用图片筛选（过滤视频/动图/heif 等无法直接参与判定的格式）；
 *   - 文件夹 ID 与路径的正反向安全解析。
 */

import type { OrganizeFolderStandard } from '@/shared/eagle/organize'
import {
  EAGLE_TRASH_FOLDER_ID,
  EAGLE_UNCLASSIFIED_FOLDER_ID,
  type EagleFolder,
  type EagleItem,
  type EagleSortBy,
  type EagleSortOrder,
} from '@/shared/eagle/types'
import { ensureIndex } from './index-state'
import {
  type EagleItemIndex,
  type EagleRawFolder,
  type GetItemsParams,
  VIDEO_EXTS,
} from './types'

/** 将内部索引条目转换为面向客户端展示的 EagleItem 结构 */
export const toEagleItem = (entry: EagleItemIndex): EagleItem => ({
  id: entry.id,
  name: entry.name,
  ext: entry.ext,
  size: entry.size,
  width: entry.width,
  height: entry.height,
  mtime: entry.mtime,
  isVideo: VIDEO_EXTS.has(entry.ext),
  isGif: entry.ext === 'gif',
  hasThumbnail: entry.thumbnailName !== null,
})

/** 统计各真实文件夹直接包含的非删除图片数量 */
export const countByFolder = (items: Map<string, EagleItemIndex>) => {
  const counts = new Map<string, number>()
  for (const item of items.values()) {
    if (item.isDeleted) continue
    for (const folderId of item.folders) {
      counts.set(folderId, (counts.get(folderId) ?? 0) + 1)
    }
  }
  return counts
}

/** 递归构造文件夹树，计算各节点的直接包含数 count 与递归累计总数 totalCount */
export const buildFolderTree = (
  raw: EagleRawFolder[],
  counts: Map<string, number>,
): EagleFolder[] =>
  raw.map((folder) => {
    const children = buildFolderTree(folder.children ?? [], counts)
    const count = counts.get(folder.id) ?? 0
    return {
      id: folder.id,
      name: folder.name,
      description: folder.description ?? '',
      children,
      count,
      totalCount:
        count + children.reduce((sum, child) => sum + child.totalCount, 0),
    }
  })

/** 在原始文件夹嵌套树中按 ID 递归查找指定节点 */
export const findRawFolder = (
  raw: EagleRawFolder[],
  id: string,
): EagleRawFolder | null => {
  for (const folder of raw) {
    if (folder.id === id) return folder
    const hit = findRawFolder(folder.children ?? [], id)
    if (hit) return hit
  }
  return null
}

/** 获取构建完成的完整文件夹树（含数量统计） */
export const getFolderTree = async (): Promise<EagleFolder[]> => {
  const index = await ensureIndex()
  if (!index) return []
  return buildFolderTree(index.folders, countByFolder(index.items))
}

/**
 * 分页与排序查询条目列表。
 * 支持：
 * - 全部条目（排除回收站）；
 * - 虚拟文件夹：回收站 (__trash__)、未分类 (__unclassified__)；
 * - 指定真实文件夹过滤；
 * - 内存排序与偏移分页切片。
 */
export const getItems = async (
  params: GetItemsParams,
): Promise<{ total: number; items: EagleItem[] }> => {
  const index = await ensureIndex()
  if (!index) return { total: 0, items: [] }
  const { folderId, sortBy, sortOrder, offset, limit } = params
  let list = [...index.items.values()]
  if (folderId === EAGLE_TRASH_FOLDER_ID) {
    list = list.filter((item) => item.isDeleted === true)
  } else {
    list = list.filter((item) => !item.isDeleted)
    if (folderId === EAGLE_UNCLASSIFIED_FOLDER_ID) {
      list = list.filter((item) => item.folders.length === 0)
    } else if (folderId) {
      list = list.filter((item) => item.folders.includes(folderId))
    }
  }
  const direction = sortOrder === 'asc' ? 1 : -1
  list.sort((a, b) => (a[sortBy] - b[sortBy]) * direction)
  return {
    total: list.length,
    items: list.slice(offset, offset + limit).map(toEagleItem),
  }
}

/**
 * 图片整理专用：提取库中有描述的文件夹作为 AI 分类标准。
 * 遍历策略：采用后序遍历（子目录先于父目录压入），确保更具体的子目录优先匹配，
 * 宽泛的父目录排在其后作为兜底分类标准。
 */
export const getFolderStandards = async (): Promise<
  OrganizeFolderStandard[]
> => {
  const index = await ensureIndex()
  if (!index) return []
  const standards: OrganizeFolderStandard[] = []
  const walk = (folders: EagleRawFolder[], parentPath: string) => {
    for (const folder of folders) {
      const folderPath = parentPath
        ? `${parentPath}/${folder.name}`
        : folder.name
      walk(folder.children ?? [], folderPath)
      if (folder.description && folder.description.trim()) {
        standards.push({
          folderId: folder.id,
          folderPath,
          name: folder.name,
          description: folder.description,
        })
      }
    }
  }
  walk(index.folders, '')
  return standards
}

/** 图片整理专用：校验指定文件夹 ID 当前是否依然存在于库中（防御性检查快照失效） */
export const folderExists = async (folderId: string): Promise<boolean> => {
  const index = await ensureIndex()
  if (!index) return false
  const walk = (folders: EagleRawFolder[]): boolean =>
    folders.some(
      (folder) => folder.id === folderId || walk(folder.children ?? []),
    )
  return walk(index.folders)
}

/**
 * 图片整理专用：获取当前文件夹下可参与 AI 分类的图片 ID 队列。
 * 自动排除回收站、gif 动图、视频及 heif/heic 等格式。
 */
export const getClassifiableItems = async (params: {
  folderId?: string
  sortBy: EagleSortBy
  sortOrder: EagleSortOrder
}): Promise<{ total: number; itemIds: string[] }> => {
  const index = await ensureIndex()
  if (!index) return { total: 0, itemIds: [] }
  if (params.folderId === EAGLE_TRASH_FOLDER_ID) {
    return { total: 0, itemIds: [] }
  }
  let list = [...index.items.values()].filter(
    (item) =>
      !item.isDeleted &&
      !VIDEO_EXTS.has(item.ext) &&
      item.ext !== 'gif' &&
      item.ext !== 'heif' &&
      item.ext !== 'heic',
  )
  if (params.folderId === EAGLE_UNCLASSIFIED_FOLDER_ID) {
    list = list.filter((item) => item.folders.length === 0)
  } else if (params.folderId) {
    list = list.filter((item) => item.folders.includes(params.folderId!))
  }
  const direction = params.sortOrder === 'asc' ? 1 : -1
  list.sort((a, b) => (a[params.sortBy] - b[params.sortBy]) * direction)
  return { total: list.length, itemIds: list.map((item) => item.id) }
}

/** 按文件夹完整路径（如 "摄影/风光"）查找对应文件夹 ID，不存在返回 null */
export const findFolderIdByPath = async (
  folderPath: string,
): Promise<string | null> => {
  const index = await ensureIndex()
  if (!index) return null
  let foundId: string | null = null
  const walk = (folders: EagleRawFolder[], parentPath: string) => {
    for (const folder of folders) {
      const currentPath = parentPath
        ? `${parentPath}/${folder.name}`
        : folder.name
      if (currentPath === folderPath) {
        foundId = folder.id
        return
      }
      walk(folder.children ?? [], currentPath)
    }
  }
  walk(index.folders, '')
  return foundId
}

/** 按文件夹 ID 列表解析其完整路径名，保留传入 ID 的顺序并忽略不存在的文件夹 */
export const getFolderPaths = async (
  folderIds: string[],
): Promise<string[]> => {
  const index = await ensureIndex()
  if (!index || folderIds.length === 0) return []

  const paths = new Map<string, string>()
  const walk = (folders: EagleRawFolder[], parentPath: string) => {
    for (const folder of folders) {
      const folderPath = parentPath
        ? `${parentPath}/${folder.name}`
        : folder.name
      paths.set(folder.id, folderPath)
      walk(folder.children ?? [], folderPath)
    }
  }
  walk(index.folders, '')
  return folderIds.flatMap((id) => {
    const folderPath = paths.get(id)
    return folderPath ? [folderPath] : []
  })
}
