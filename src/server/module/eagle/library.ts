import type { OrganizeFolderStandard } from '@/shared/eagle/organize'
import {
  EAGLE_UNCLASSIFIED_FOLDER_ID,
  type EagleFolder,
  type EagleItem,
  type EagleSortBy,
  type EagleSortOrder,
} from '@/shared/eagle/types'
import fs from 'fs-extra'
import path from 'path'
import { changeBus } from '../../common/storage/change-bus'
import { dataPath } from '../../common/storage/data-path'
import { getEagleSettings } from './settings'

/**
 * Eagle 资源库内存索引。
 * 设计要点（对应 docs/Eagle资源库.txt 的问题）：
 * - 不逐个读 2 万个 metadata.json：启动读本地索引缓存（data/eagle/index.json）毫秒级进内存
 * - 变更检测 = readdir 枚举 images/ 目录 + 库根 mtime.json 单文件对比，
 *   只有 lastModified 变化/新增/消失的条目才重读各自的 metadata.json
 * - fs.watch 只作触发器（Windows 大目录下可能丢事件），判断一律落到 mtime 对比
 * - 对库目录只读；索引缓存写在自己项目的 data/eagle/ 下
 */

// ---- Eagle 库内原始数据结构 ----

interface EagleRawFolder {
  id: string
  name: string
  description?: string
  children?: EagleRawFolder[]
}

interface EagleRawItemMeta {
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

// ---- 索引条目（持久化到 data/eagle/index.json） ----

interface EagleItemIndex {
  id: string
  name: string
  ext: string
  size: number
  width: number
  height: number
  mtime: number
  lastModified: number
  folders: string[]
  /** 原文件名（含扩展名） */
  fileName: string
  /** 缩略图文件名，不存在为 null */
  thumbnailName: string | null
}

interface EagleIndexCacheFile {
  libraryPath: string
  scannedAt: number
  items: EagleItemIndex[]
}

const VIDEO_EXTS = new Set(['mp4', 'webm', 'mov', 'avi', 'mkv', 'flv', 'm4v'])
const ITEM_ID_PATTERN = /^[A-Za-z0-9]+$/
const WATCH_DEBOUNCE_MS = 500
/** 全量扫描时并发读 metadata.json 的并发度 */
const SCAN_CONCURRENCY = 32

const CACHE_FILE = dataPath('eagle', 'index.json')

/** 库内容变更（updateItem 写库后发布），前端订阅后刷新文件夹树与列表 */
export const EAGLE_LIBRARY_RESOURCE = 'eagle.library'
changeBus.register(EAGLE_LIBRARY_RESOURCE)

interface EagleIndexState {
  libraryPath: string
  folders: EagleRawFolder[]
  items: Map<string, EagleItemIndex>
}

let state: EagleIndexState | null = null
let loadingPromise: Promise<void> | null = null
let watcher: fs.FSWatcher | null = null
let rootWatcher: fs.FSWatcher | null = null
let watchTimer: ReturnType<typeof setTimeout> | null = null

/** 获取已配置的库路径，未配置返回 null */
const resolveLibraryPath = async (): Promise<string | null> => {
  const settings = await getEagleSettings()
  return settings.libraryPath || null
}

const imagesDir = (libraryPath: string) => path.join(libraryPath, 'images')

/** 读取单个条目的 metadata.json，失败返回 null（文件损坏不拖垮整体） */
const readItemMeta = async (
  libraryPath: string,
  id: string,
): Promise<EagleItemMeta | null> => {
  try {
    const raw = await fs.readJson(
      path.join(imagesDir(libraryPath), `${id}.info`, 'metadata.json'),
    )
    return raw as EagleItemMeta
  } catch {
    return null
  }
}

type EagleItemMeta = EagleRawItemMeta

/** 从原始 metadata 生成索引条目（探测原文件/缩略图文件名） */
const buildIndexEntry = async (
  libraryPath: string,
  meta: EagleRawItemMeta,
): Promise<EagleItemIndex | null> => {
  const dir = path.join(imagesDir(libraryPath), `${meta.id}.info`)
  let files: string[]
  try {
    files = await fs.readdir(dir)
  } catch {
    return null
  }
  const ext = (meta.ext || '').toLowerCase()
  const fileName =
    files.find(
      (f) => f.toLowerCase() === `${meta.name}.${ext}`.toLowerCase(),
    ) ??
    files.find(
      (f) => f.toLowerCase().endsWith(`.${ext}`) && !f.includes('_thumbnail'),
    ) ??
    null
  if (!fileName) return null
  const thumbnailName = files.find((f) => f.includes('_thumbnail')) ?? null
  return {
    id: meta.id,
    name: meta.name,
    ext,
    size: meta.size ?? 0,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    mtime: meta.mtime ?? 0,
    lastModified: meta.lastModified ?? 0,
    folders: meta.folders ?? [],
    fileName,
    thumbnailName,
  }
}

/** 简单并发池 */
const runPool = async <T>(
  list: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
) => {
  let cursor = 0
  const lanes = Array.from(
    { length: Math.min(concurrency, list.length) },
    async () => {
      while (cursor < list.length) {
        const item = list[cursor++]
        await worker(item)
      }
    },
  )
  await Promise.all(lanes)
}

const persistCache = async () => {
  if (!state) return
  const cache: EagleIndexCacheFile = {
    libraryPath: state.libraryPath,
    scannedAt: Date.now(),
    items: [...state.items.values()],
  }
  await fs.ensureDir(path.dirname(CACHE_FILE))
  const tmp = `${CACHE_FILE}.tmp`
  await fs.writeJson(tmp, cache)
  await fs.move(tmp, CACHE_FILE, { overwrite: true })
}

/**
 * 增量校验：对比 mtime.json / 目录枚举 / 内存索引，只重读变化的条目。
 * mtime.json 缺失时降级为「新目录读 metadata，已有条目信任缓存」。
 */
const syncIndex = async (libraryPath: string) => {
  // 文件夹树
  const rawLibrary = (await fs.readJson(
    path.join(libraryPath, 'metadata.json'),
  )) as { folders?: EagleRawFolder[] }
  const folders = rawLibrary.folders ?? []

  // 变更指纹表（Eagle 私有实现，可能不存在）
  let mtimeMap: Record<string, number> | null = null
  try {
    mtimeMap = await fs.readJson(path.join(libraryPath, 'mtime.json'))
  } catch {
    mtimeMap = null
  }

  // 目录枚举（2 万个目录名，OS 层面几十毫秒）
  const dirNames = await fs.readdir(imagesDir(libraryPath))
  const diskIds = new Set(
    dirNames
      .filter((d) => d.endsWith('.info'))
      .map((d) => d.slice(0, -'.info'.length)),
  )

  if (!state || state.libraryPath !== libraryPath) {
    state = { libraryPath, folders: [], items: new Map() }
  }
  state.folders = folders
  const items = state.items

  // 消失的条目
  for (const id of [...items.keys()]) {
    if (!diskIds.has(id)) items.delete(id)
  }

  // 新增 / lastModified 变化的条目
  const toLoad: string[] = []
  for (const id of diskIds) {
    const cached = items.get(id)
    if (!cached) {
      toLoad.push(id)
    } else if (mtimeMap && mtimeMap[id] !== undefined) {
      if (mtimeMap[id] !== cached.lastModified) toLoad.push(id)
    }
    // mtime.json 缺失时信任缓存（降级路径）
  }

  if (toLoad.length > 0) {
    await runPool(toLoad, SCAN_CONCURRENCY, async (id) => {
      const meta = await readItemMeta(libraryPath, id)
      if (!meta || meta.isDeleted) {
        items.delete(id)
        return
      }
      const entry = await buildIndexEntry(libraryPath, meta)
      if (entry) items.set(id, entry)
    })
  }
}

const scheduleWatcher = (libraryPath: string) => {
  watcher?.close()
  rootWatcher?.close()
  watcher = null
  rootWatcher = null
  const trigger = () => {
    if (watchTimer) clearTimeout(watchTimer)
    watchTimer = setTimeout(() => {
      refreshIndex().catch((err) =>
        console.error('[Eagle] 监听触发的增量刷新失败', err),
      )
    }, WATCH_DEBOUNCE_MS)
  }
  try {
    // images/ 目录内条目增删改
    watcher = fs.watch(imagesDir(libraryPath), trigger)
    // 库根 metadata.json / mtime.json 变化（文件夹树、指纹表）
    rootWatcher = fs.watch(libraryPath, trigger)
    watcher.on('error', () => {})
    rootWatcher.on('error', () => {})
  } catch (err) {
    console.error('[Eagle] fs.watch 启动失败，变更检测退化为手动刷新', err)
  }
}

const loadFromCache = async (libraryPath: string): Promise<boolean> => {
  try {
    const cache = (await fs.readJson(CACHE_FILE)) as EagleIndexCacheFile
    if (cache.libraryPath !== libraryPath) return false
    state = {
      libraryPath,
      folders: [],
      items: new Map(cache.items.map((item) => [item.id, item])),
    }
    return true
  } catch {
    return false
  }
}

const initialLoad = async () => {
  const libraryPath = await resolveLibraryPath()
  if (!libraryPath) {
    state = null
    return
  }
  const fromCache = await loadFromCache(libraryPath)
  // 缓存命中先可用，随后后台增量校验；未命中则本次同步全量扫描
  await syncIndex(libraryPath)
  await persistCache()
  scheduleWatcher(libraryPath)
  console.log(
    `[Eagle] 索引就绪：${state?.items.size ?? 0} 个条目（${fromCache ? '缓存+增量' : '全量扫描'}）`,
  )
}

/** 确保索引已加载（首次请求会等待加载完成） */
export const ensureIndex = async (): Promise<EagleIndexState | null> => {
  if (!loadingPromise) {
    loadingPromise = initialLoad().catch((err) => {
      console.error('[Eagle] 索引加载失败', err)
      loadingPromise = null
      throw err
    })
  }
  await loadingPromise
  return state
}

/** 手动/监听触发刷新：库路径变化时重建，否则增量校验 */
export const refreshIndex = async (): Promise<void> => {
  const libraryPath = await resolveLibraryPath()
  if (!libraryPath) {
    state = null
    return
  }
  if (!state || state.libraryPath !== libraryPath) {
    loadingPromise = null
    await ensureIndex()
    return
  }
  await syncIndex(libraryPath)
  await persistCache()
}

// ---- 查询 ----

export interface GetItemsParams {
  folderId?: string
  sortBy: EagleSortBy
  sortOrder: EagleSortOrder
  offset: number
  limit: number
}

const toEagleItem = (entry: EagleItemIndex): EagleItem => ({
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

const countByFolder = (items: Map<string, EagleItemIndex>) => {
  const counts = new Map<string, number>()
  for (const item of items.values()) {
    for (const folderId of item.folders) {
      counts.set(folderId, (counts.get(folderId) ?? 0) + 1)
    }
  }
  return counts
}

const buildFolderTree = (
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

/** 在原始文件夹树中按 id 查找节点 */
const findRawFolder = (
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

/**
 * 编辑文件夹名称/描述（写回库根 metadata.json，原子写入，保留其他字段）。
 * 这是本模块对库目录唯一的写操作。返回 false 表示文件夹不存在。
 */
export const updateFolder = async (
  id: string,
  patch: { name: string; description: string },
): Promise<boolean> => {
  const index = await ensureIndex()
  if (!index) return false
  const metaPath = path.join(index.libraryPath, 'metadata.json')
  const rawLibrary = (await fs.readJson(metaPath)) as {
    folders?: EagleRawFolder[]
  }
  const target = findRawFolder(rawLibrary.folders ?? [], id)
  if (!target) return false
  target.name = patch.name
  target.description = patch.description
  const tmp = `${metaPath}.tmp`
  await fs.writeJson(tmp, rawLibrary)
  await fs.move(tmp, metaPath, { overwrite: true })
  // 同步内存中的文件夹树（fs.watch 也会触发增量校验，这里立即生效）
  index.folders = rawLibrary.folders ?? []
  return true
}

export interface UpdateItemPatch {
  /** 新标题（同时重命名 .info 内原文件与缩略图）；缺省不改名 */
  name?: string
  /** 目标文件夹 id 列表（替换 folders，可传空数组清除分类）；缺省不改动 */
  folderIds?: string[]
}

/** 条目名即文件名：去掉 Windows 文件名非法字符与首尾空白/点号，限制长度 */
const sanitizeItemName = (name: string): string =>
  name
    .replace(/[\\/:*?"<>|\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s.]+$/, '')
    .slice(0, 120)
    .trim()

/**
 * 编辑条目（图片整理确认动作）：改标题（含重命名 .info 内原文件/缩略图）与所属文件夹。
 * 同步链路：条目 metadata.json → 库根 mtime.json → 内存索引 + 缓存 → change bus。
 * 返回 false 表示条目不存在；重命名冲突超过 99 个同名时抛错。
 */
export const updateItem = async (
  id: string,
  patch: UpdateItemPatch,
): Promise<boolean> => {
  if (!ITEM_ID_PATTERN.test(id)) return false
  const index = await ensureIndex()
  if (!index) return false
  const entry = index.items.get(id)
  if (!entry) return false
  const meta = await readItemMeta(index.libraryPath, id)
  if (!meta) return false

  // 计算最终条目名（AI 建议标题可能含非法字符，清理后为空则保持原名）
  let targetName = meta.name
  if (patch.name !== undefined) {
    const sanitized = sanitizeItemName(patch.name)
    if (sanitized) targetName = sanitized
  }

  const infoDir = path.join(imagesDir(index.libraryPath), `${id}.info`)
  const oldFileName = entry.fileName
  const oldFilePath = path.join(infoDir, oldFileName)
  // 原文件 stat（改名 move 不改内容 mtime，条目 mtime 字段保持不变）
  let fileStat: fs.Stats | null = null
  try {
    fileStat = await fs.stat(oldFilePath)
  } catch {
    // 原文件缺失仍允许改元数据
  }

  let fileName = oldFileName
  let thumbnailName = entry.thumbnailName
  if (targetName !== meta.name) {
    // 同名冲突时文件名追加序号，条目名同步（Eagle 用条目名定位原文件）
    for (let suffix = 0; ; suffix++) {
      const candidate = suffix === 0 ? targetName : `${targetName} (${suffix})`
      const candidateFile = `${candidate}.${entry.ext}`
      // 仅大小写差异时 pathExists 会命中旧文件本身，视为可改名
      const isOldItself =
        candidateFile.toLowerCase() === oldFileName.toLowerCase()
      if (
        isOldItself ||
        !(await fs.pathExists(path.join(infoDir, candidateFile)))
      ) {
        targetName = candidate
        fileName = candidateFile
        break
      }
      if (suffix >= 99)
        throw new Error(`重命名冲突：${targetName}.${entry.ext} 已存在`)
    }
    await fs.move(oldFilePath, path.join(infoDir, fileName), {
      overwrite: true,
    })
    // Eagle 缩略图命名跟随条目名（<name>_thumbnail.<ext>），匹配旧名时同步重命名
    if (thumbnailName) {
      const thumbExt = path.extname(thumbnailName)
      const oldThumbBase = path.basename(thumbnailName, thumbExt)
      if (
        oldThumbBase.toLowerCase() === `${meta.name}_thumbnail`.toLowerCase()
      ) {
        const newThumb = `${targetName}_thumbnail${thumbExt}`
        const newThumbPath = path.join(infoDir, newThumb)
        if (
          newThumb.toLowerCase() !== thumbnailName.toLowerCase() &&
          !(await fs.pathExists(newThumbPath))
        ) {
          await fs.move(path.join(infoDir, thumbnailName), newThumbPath)
          thumbnailName = newThumb
        }
      }
    }
  }

  const lastModified = Date.now()
  const folders = patch.folderIds ?? meta.folders
  const nextMeta: EagleRawItemMeta = {
    ...meta,
    name: targetName,
    folders,
    lastModified,
    mtime: fileStat ? Math.round(fileStat.mtimeMs) : meta.mtime,
  }
  const metaPath = path.join(infoDir, 'metadata.json')
  const metaTmp = `${metaPath}.tmp`
  await fs.writeJson(metaTmp, nextMeta)
  await fs.move(metaTmp, metaPath, { overwrite: true })

  // 同步库根 mtime.json（自身增量校验与 Eagle 行为一致）；文件本不存在时不重建
  const mtimePath = path.join(index.libraryPath, 'mtime.json')
  if (await fs.pathExists(mtimePath)) {
    let mtimeMap: Record<string, number> = {}
    try {
      mtimeMap = await fs.readJson(mtimePath)
    } catch {
      // 损坏则仅保留本次条目（增量校验对缺失条目信任缓存）
    }
    mtimeMap[id] = lastModified
    const mtimeTmp = `${mtimePath}.tmp`
    await fs.writeJson(mtimeTmp, mtimeMap)
    await fs.move(mtimeTmp, mtimePath, { overwrite: true })
  }

  // 内存索引与缓存同步（fs.watch 也会触发一次增量校验，这里先立即生效）
  index.items.set(id, {
    ...entry,
    name: targetName,
    fileName,
    thumbnailName,
    folders: folders ?? [],
    mtime: nextMeta.mtime,
    lastModified,
  })
  await persistCache()
  changeBus.publish({ resource: EAGLE_LIBRARY_RESOURCE })
  return true
}

/**
 * 移入 Eagle 回收站：软删除条目（设置 isDeleted: true，同步 mtime.json，从内存索引移除）。
 * 不物理删除磁盘原文件与目录，与 Eagle 官方回收站逻辑保持一致。
 */
export const deleteItem = async (id: string): Promise<boolean> => {
  if (!ITEM_ID_PATTERN.test(id)) return false
  const index = await ensureIndex()
  if (!index) return false
  const meta = await readItemMeta(index.libraryPath, id)
  if (!meta) return false

  const lastModified = Date.now()
  const nextMeta: EagleRawItemMeta = {
    ...meta,
    isDeleted: true,
    lastModified,
  }
  const infoDir = path.join(imagesDir(index.libraryPath), `${id}.info`)
  const metaPath = path.join(infoDir, 'metadata.json')
  const metaTmp = `${metaPath}.tmp`
  await fs.writeJson(metaTmp, nextMeta)
  await fs.move(metaTmp, metaPath, { overwrite: true })

  // 同步库根 mtime.json
  const mtimePath = path.join(index.libraryPath, 'mtime.json')
  if (await fs.pathExists(mtimePath)) {
    let mtimeMap: Record<string, number> = {}
    try {
      mtimeMap = await fs.readJson(mtimePath)
    } catch {}
    mtimeMap[id] = lastModified
    const mtimeTmp = `${mtimePath}.tmp`
    await fs.writeJson(mtimeTmp, mtimeMap)
    await fs.move(mtimeTmp, mtimePath, { overwrite: true })
  }

  // 从内存索引中删除
  index.items.delete(id)
  await persistCache()
  changeBus.publish({ resource: EAGLE_LIBRARY_RESOURCE })
  return true
}

/** 按文件夹完整路径（如 "分类A/子分类B"）查找对应文件夹 ID，不存在返回 null */
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

export const getFolderTree = async (): Promise<EagleFolder[]> => {
  const index = await ensureIndex()
  if (!index) return []
  return buildFolderTree(index.folders, countByFolder(index.items))
}

export const getItems = async (
  params: GetItemsParams,
): Promise<{ total: number; items: EagleItem[] }> => {
  const index = await ensureIndex()
  if (!index) return { total: 0, items: [] }
  const { folderId, sortBy, sortOrder, offset, limit } = params
  let list = [...index.items.values()]
  if (folderId === EAGLE_UNCLASSIFIED_FOLDER_ID) {
    list = list.filter((item) => item.folders.length === 0)
  } else if (folderId) {
    list = list.filter((item) => item.folders.includes(folderId))
  }
  const direction = sortOrder === 'asc' ? 1 : -1
  list.sort((a, b) => (a[sortBy] - b[sortBy]) * direction)
  return {
    total: list.length,
    items: list.slice(offset, offset + limit).map(toEagleItem),
  }
}

/**
 * 图片整理用：有描述的文件夹 → 分类标准。
 * 按原文件夹顺序遍历，但子目录先于父目录压入（后序）：子目录更具体是小类，
 * 父目录更宽泛是大类，放在其后作为"不属于任何小类但属于大类"的兜底，顺序即优先级
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

/** 图片整理用：校验文件夹当前仍存在于库中（按 id，改名不影响），写库前防御快照失效 */
export const folderExists = async (folderId: string): Promise<boolean> => {
  const index = await ensureIndex()
  if (!index) return false
  const walk = (folders: EagleRawFolder[]): boolean =>
    folders.some(
      (folder) => folder.id === folderId || walk(folder.children ?? []),
    )
  return walk(index.folders)
}

/** 图片整理用：可处理图片（排除 gif / 视频），排序后返回 id 队列与总数 */
export const getClassifiableItems = async (params: {
  folderId?: string
  sortBy: EagleSortBy
  sortOrder: EagleSortOrder
}): Promise<{ total: number; itemIds: string[] }> => {
  const index = await ensureIndex()
  if (!index) return { total: 0, itemIds: [] }
  let list = [...index.items.values()].filter(
    (item) => !VIDEO_EXTS.has(item.ext) && item.ext !== 'gif',
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

/** 供 API 层查询索引条目（含 id 格式校验） */
export const getItemEntry = async (
  id: string,
): Promise<EagleItemIndex | null> => {
  if (!ITEM_ID_PATTERN.test(id)) return null
  const index = await ensureIndex()
  return index?.items.get(id) ?? null
}

/** 按文件夹 ID 解析完整路径，保留传入 ID 的顺序并忽略已删除的文件夹。 */
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

/** 原文件绝对路径（路径由索引查出，不拼接用户输入） */
export const getItemFilePath = async (id: string): Promise<string | null> => {
  const entry = await getItemEntry(id)
  if (!entry || !state) return null
  return path.join(imagesDir(state.libraryPath), `${id}.info`, entry.fileName)
}

/** 库内预生成缩略图路径，不存在返回 null */
export const getItemThumbnailPath = async (
  id: string,
): Promise<string | null> => {
  const entry = await getItemEntry(id)
  if (!entry || !state || !entry.thumbnailName) return null
  return path.join(
    imagesDir(state.libraryPath),
    `${id}.info`,
    entry.thumbnailName,
  )
}

export const isVideoExt = (ext: string) => VIDEO_EXTS.has(ext)
