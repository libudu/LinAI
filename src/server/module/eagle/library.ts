import fs from 'fs-extra'
import path from 'path'
import type {
  EagleFolder,
  EagleItem,
  EagleSortBy,
  EagleSortOrder,
} from '@/shared/eagle/types'
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
    files.find((f) => f.toLowerCase() === `${meta.name}.${ext}`.toLowerCase()) ??
    files.find(
      (f) =>
        f.toLowerCase().endsWith(`.${ext}`) && !f.includes('_thumbnail'),
    ) ??
    null
  if (!fileName) return null
  const thumbnailName =
    files.find((f) => f.includes('_thumbnail')) ?? null
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
  if (folderId) {
    list = list.filter((item) => item.folders.includes(folderId))
  }
  const direction = sortOrder === 'asc' ? 1 : -1
  list.sort((a, b) => (a[sortBy] - b[sortBy]) * direction)
  return {
    total: list.length,
    items: list.slice(offset, offset + limit).map(toEagleItem),
  }
}

/** 供 API 层查询索引条目（含 id 格式校验） */
export const getItemEntry = async (
  id: string,
): Promise<EagleItemIndex | null> => {
  if (!ITEM_ID_PATTERN.test(id)) return null
  const index = await ensureIndex()
  return index?.items.get(id) ?? null
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
