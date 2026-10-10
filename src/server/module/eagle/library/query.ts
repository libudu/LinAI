/**
 * Eagle 资源库内存查询与数据视图投影。
 *
 * 包含：
 * - 索引条目向前端 EagleItem 的转换投影；
 * - 文件夹树构造与直接图片数 / 子孙递归总数（totalCount）统计；
 * - 服务端条目分页、排序与虚拟文件夹过滤（未分类、回收站）；
 * - 图片整理专项查询：
 *   - 有描述文件夹转分类标准（后序遍历保证子分类优先级高、父分类兜底）；
 *   - 分类范围可用图片筛选（按任务媒体类型筛选；图片排除动图/heif 等无法直接参与判定的格式）；
 *   - 文件夹 ID 与路径的正反向安全解析。
 */

import type {
  OrganizeFolderStandard,
  OrganizePrepareParams,
} from '@/shared/eagle/organize'
import { needsOrganizeRename } from '@/shared/eagle/organize'
import {
  EAGLE_TRASH_FOLDER_ID,
  EAGLE_UNCLASSIFIED_FOLDER_ID,
  type EagleFolder,
  type EagleItem,
  type EagleLibraryOverview,
  type EagleMediaType,
} from '@/shared/eagle/types'
import { createHash } from 'node:crypto'
import path from 'path'
import {
  buildFolderStandards,
  buildFolderTree,
  collectFolderPaths,
  findRawFolder,
  findRawFolderIdByPath,
  resolveFolderPaths,
} from './folders'
import { ensureIndex, libraryChanges } from './index-state'
import {
  imagesDir,
  ITEM_ID_PATTERN,
  matchesMediaType,
  VIDEO_EXTS,
} from './runtime'
import {
  type EagleIndexState,
  type EagleItemDetail,
  type EagleItemIndex,
  type EagleItemMediaSource,
  type EagleItemSnapshot,
  type GetItemsParams,
} from './types'

/** 将内部索引条目转换为面向客户端展示的 EagleItem 结构 */
const contentVersion = (entry: EagleItemIndex, libraryPath: string) =>
  createHash('sha256')
    .update(JSON.stringify([libraryPath, entry.fileName, entry.lastModified]))
    .digest('hex')
    .slice(0, 24)

export const toEagleItem = (
  entry: EagleItemIndex,
  libraryPath: string,
): EagleItem => ({
  id: entry.id,
  name: entry.name,
  ext: entry.ext,
  size: entry.size,
  width: entry.width,
  height: entry.height,
  mtime: entry.mtime,
  lastModified: entry.lastModified,
  contentVersion: contentVersion(entry, libraryPath),
  folders: [...(entry.folders ?? [])],
  isVideo: VIDEO_EXTS.has(entry.ext),
  isGif: entry.ext === 'gif',
  hasThumbnail: entry.thumbnailName !== null,
})

// 查询条件最多保留 8 份排序视图；翻页只切片和投影，版本变化即丢弃旧视图。
let cachedVersion = ''
const overviewCache = new Map<string, EagleLibraryOverview>()
const itemViews = new Map<string, EagleItemIndex[]>()

const ensureQueryVersion = () => {
  if (cachedVersion === libraryChanges.version) return
  cachedVersion = libraryChanges.version
  overviewCache.clear()
  itemViews.clear()
}

const sortedItems = (
  index: EagleIndexState,
  params: Pick<
    GetItemsParams,
    'folderId' | 'sortBy' | 'sortOrder' | 'keyword' | 'mediaType'
  >,
  classifiable = false,
  recursiveFolderIds?: Set<string>,
): EagleItemIndex[] => {
  ensureQueryVersion()
  const { folderId, sortBy, sortOrder } = params
  const keywords = (params.keyword?.toLowerCase() ?? '')
    .split(/\s+/)
    .filter(Boolean)
  const key = JSON.stringify([
    folderId ?? '',
    sortBy,
    sortOrder,
    keywords,
    params.mediaType ?? '',
    classifiable,
    recursiveFolderIds ? [...recursiveFolderIds] : null,
  ])
  const cached = itemViews.get(key)
  if (cached) {
    itemViews.delete(key)
    itemViews.set(key, cached)
    return cached
  }
  const list: EagleItemIndex[] = []
  for (const item of index.items.values()) {
    if (!matchesMediaType(item.ext, params.mediaType)) continue
    if (folderId === EAGLE_TRASH_FOLDER_ID) {
      if (!item.isDeleted || classifiable) continue
    } else {
      if (item.isDeleted) continue
      if (folderId === EAGLE_UNCLASSIFIED_FOLDER_ID) {
        if (item.folders.length !== 0) continue
      } else if (recursiveFolderIds) {
        if (!item.folders.some((id) => recursiveFolderIds.has(id))) continue
      } else if (folderId && !item.folders.includes(folderId)) continue
    }
    if (
      classifiable &&
      params.mediaType !== 'video' &&
      (VIDEO_EXTS.has(item.ext) || ['gif', 'heif', 'heic'].includes(item.ext))
    )
      continue
    if (keywords.length > 0) {
      const name = item.name.toLowerCase()
      if (!keywords.every((keyword) => name.includes(keyword))) continue
    }
    list.push(item)
  }
  const direction = sortOrder === 'asc' ? 1 : -1
  list.sort((a, b) => (a[sortBy] - b[sortBy]) * direction)
  itemViews.set(key, list)
  if (itemViews.size > 8) itemViews.delete(itemViews.keys().next().value!)
  return list
}

/** 整理增量查询只读取变更 ID 和版本，不暴露可变索引。 */
export const getLibraryChanges = async (since?: string) => {
  await ensureIndex()
  return { version: libraryChanges.version, ids: libraryChanges.since(since) }
}

/** 获取构建完成的完整文件夹树（含数量统计） */
export const getFolderTree = async (
  mediaType?: EagleMediaType,
): Promise<EagleFolder[]> => (await getLibraryOverview(mediaType)).folders

/** 一次遍历计算真实目录计数与虚拟目录总数，不构造或排序条目列表。 */
export const getLibraryOverview = async (
  mediaType?: EagleMediaType,
): Promise<EagleLibraryOverview> => {
  const index = await ensureIndex()
  ensureQueryVersion()
  const cacheKey = mediaType ?? ''
  const cached = overviewCache.get(cacheKey)
  if (cached) return cached
  const overview: EagleLibraryOverview = {
    folders: [],
    allTotal: 0,
    unclassifiedTotal: 0,
    trashTotal: 0,
    trashSize: 0,
  }
  if (!index) return overview
  const counts = new Map<string, number>()
  for (const item of index.items.values()) {
    if (!matchesMediaType(item.ext, mediaType)) continue
    if (item.isDeleted) {
      overview.trashTotal++
      overview.trashSize += item.size
      continue
    }
    overview.allTotal++
    if (item.folders.length === 0) overview.unclassifiedTotal++
    for (const folderId of item.folders)
      counts.set(folderId, (counts.get(folderId) ?? 0) + 1)
  }
  overview.folders = buildFolderTree(index.folders, counts)
  overviewCache.set(cacheKey, overview)
  return overview
}

/**
 * 分页与排序查询条目列表。
 * 支持：
 * - 全部条目（排除回收站）；
 * - 虚拟文件夹：回收站 (__trash__)、未分类 (__unclassified__)；
 * - 指定真实文件夹过滤；
 * - 文件名关键词匹配（空白分隔的关键词需全部包含，不区分大小写）；
 * - 内存排序与偏移分页切片。
 */
export const getItems = async (
  params: GetItemsParams,
): Promise<{ total: number; items: EagleItem[] }> => {
  const index = await ensureIndex()
  if (!index) return { total: 0, items: [] }
  const { offset, limit } = params
  const list = sortedItems(index, params)
  return {
    total: list.length,
    items: list
      .slice(offset, offset + limit)
      .map((entry) => toEagleItem(entry, index.libraryPath)),
  }
}

/**
 * 图片整理专用：提取有描述的文件夹作为 AI 分类标准；可限定为指定父目录的所有子孙目录。
 * 遍历策略：采用后序遍历（子目录先于父目录压入），确保更具体的子目录优先匹配，
 * 宽泛的父目录排在其后作为兜底分类标准。
 */
export const getFolderStandards = async (
  parentFolderId?: string,
): Promise<OrganizeFolderStandard[]> => {
  const index = await ensureIndex()
  return index ? buildFolderStandards(index.folders, parentFolderId) : []
}

/** 图片整理专用：校验指定文件夹 ID 当前是否依然存在于库中（防御性检查快照失效） */
export const folderExists = async (folderId: string): Promise<boolean> => {
  const index = await ensureIndex()
  return index ? findRawFolder(index.folders, folderId) !== null : false
}

/**
 * 图片整理专用：获取当前文件夹下可处理的图片 ID 队列。
 * 递归仅重命名包含当前目录与全部子孙目录，并筛掉已匹配当前模型标识的名称。
 * 按媒体类型筛选；图片排除 gif/heif/heic，视频通过联系表参与判定，均排除回收站。
 */
export const getClassifiableItems = async (
  params: OrganizePrepareParams,
  modelId?: string,
): Promise<{ total: number; itemIds: string[] }> => {
  const index = await ensureIndex()
  if (!index) return { total: 0, itemIds: [] }
  const renameOnly = params.classificationMode === 'recursive-rename'
  const root =
    renameOnly && params.folderId
      ? findRawFolder(index.folders, params.folderId)
      : null
  if (renameOnly && !root) return { total: 0, itemIds: [] }
  const recursiveFolderIds = root
    ? new Set(collectFolderPaths([root]).map(({ folder }) => folder.id))
    : undefined
  const list = sortedItems(
    index,
    { ...params, mediaType: params.mediaType ?? 'image' },
    true,
    recursiveFolderIds,
  ).filter(
    (item) => !renameOnly || needsOrganizeRename(item.name, modelId ?? ''),
  )
  return { total: list.length, itemIds: list.map((item) => item.id) }
}

/** 按文件夹完整路径（如 "摄影/风光"）查找对应文件夹 ID，不存在返回 null */
export const findFolderIdByPath = async (
  folderPath: string,
): Promise<string | null> => {
  const index = await ensureIndex()
  return index ? findRawFolderIdByPath(index.folders, folderPath) : null
}

/** 按文件夹 ID 列表解析其完整路径名，保留传入 ID 的顺序并忽略不存在的文件夹 */
export const getFolderPaths = async (
  folderIds: string[],
): Promise<string[]> => {
  const index = await ensureIndex()
  return index && folderIds.length > 0
    ? resolveFolderPaths(index.folders, folderIds)
    : []
}

/** 公共查询仅投影业务详情，调用方不依赖内部索引结构。 */
export const getItemDetail = async (
  id: string,
): Promise<EagleItemDetail | null> => {
  if (!ITEM_ID_PATTERN.test(id)) return null
  const index = await ensureIndex()
  const item = index?.items.get(id)
  if (!index || !item) return null
  return {
    name: item.name,
    ext: item.ext,
    contentVersion: contentVersion(item, index.libraryPath),
    width: item.width,
    height: item.height,
    size: item.size,
    folderPaths: resolveFolderPaths(index.folders, item.folders),
  }
}

/** 按需投影指定 ID 的摘要，null 区分索引不可用与有效索引中的缺失条目。 */
export const getItemSnapshots = async (
  ids: string[],
): Promise<ReadonlyMap<string, EagleItemSnapshot> | null> => {
  const index = await ensureIndex()
  if (!index) return null
  const items = new Map<string, EagleItemSnapshot>()
  for (const id of ids) {
    const item = index.items.get(id)
    if (item) {
      const { name, mtime, lastModified, width, height, size } = item
      items.set(id, { name, mtime, lastModified, width, height, size })
    }
  }
  return items
}

export const getItemPresence = async (
  id: string,
): Promise<'unavailable' | 'present' | 'missing'> => {
  const index = await ensureIndex()
  if (!index) return 'unavailable'
  return ITEM_ID_PATTERN.test(id) && index.items.has(id) ? 'present' : 'missing'
}

export const getItemMediaSource = async (
  id: string,
): Promise<EagleItemMediaSource | null> => {
  if (!ITEM_ID_PATTERN.test(id)) return null
  const index = await ensureIndex()
  const entry = index?.items.get(id)
  if (!index || !entry) return null
  const infoDir = path.join(imagesDir(index.libraryPath), `${id}.info`)
  return {
    id,
    libraryPath: index.libraryPath,
    name: entry.name,
    ext: entry.ext,
    lastModified: entry.lastModified,
    contentVersion: contentVersion(entry, index.libraryPath),
    filePath: path.join(infoDir, entry.fileName),
    thumbnailPath: entry.thumbnailName
      ? path.join(infoDir, entry.thumbnailName)
      : null,
  }
}
