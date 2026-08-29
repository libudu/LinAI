/**
 * Eagle 资源库内存索引与缓存同步管理。
 *
 * 设计要点：
 * 1. 毫秒级冷启动：优先读取本地持久化索引缓存（data/eagle/index.json），无缓存才执行全量扫描；
 * 2. 极速增量校验：通过 readdir 枚举 images/ 目录 + 库根 mtime.json（变更指纹表）快速对比，
 *    仅重读 lastModified 改变、新增或缺失的条目 metadata.json；
 * 3. 防抖文件监听：fs.watch 作为事件触发器，统一防抖后执行 mtime 比对增量同步；
 * 4. 并发控制：扫描与批量加载由 runPool 维持安全并发度（默认 32）。
 */

import fs from 'fs-extra'
import path from 'path'
import { getEagleSettings } from '../settings'
import {
  CACHE_FILE,
  type EagleIndexCacheFile,
  type EagleIndexState,
  type EagleItemIndex,
  type EagleRawFolder,
  type EagleRawItemMeta,
  imagesDir,
  ITEM_ID_PATTERN,
  SCAN_CONCURRENCY,
  WATCH_DEBOUNCE_MS,
} from './types'

let state: EagleIndexState | null = null
let loadingPromise: Promise<void> | null = null
let watcher: fs.FSWatcher | null = null
let rootWatcher: fs.FSWatcher | null = null
let watchTimer: ReturnType<typeof setTimeout> | null = null

/** 获取当前内存中的索引状态（若未初始化或无配置则为 null） */
export const getState = (): EagleIndexState | null => state

/** 获取已配置的 Eagle 资源库绝对路径，未配置或为空返回 null */
export const resolveLibraryPath = async (): Promise<string | null> => {
  const settings = await getEagleSettings()
  return settings.libraryPath || null
}

/** 读取单个条目的 metadata.json，若文件缺失或 JSON 解析失败返回 null（防御性单项容错） */
export const readItemMeta = async (
  libraryPath: string,
  id: string,
): Promise<EagleRawItemMeta | null> => {
  try {
    const raw = await fs.readJson(
      path.join(imagesDir(libraryPath), `${id}.info`, 'metadata.json'),
    )
    return raw as EagleRawItemMeta
  } catch {
    return null
  }
}

/**
 * 从原始 metadata 生成索引条目。
 * 会探测 .info 目录下的真实文件名与 Eagle 生成的缩略图文件名（如 `_thumbnail.png`）。
 */
export const buildIndexEntry = async (
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
  // 匹配规则：优先全名精确匹配，兜底按扩展名探测非缩略图主文件
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
    isDeleted: meta.isDeleted === true,
  }
}

/** 轻量并发工作池，控制最大并发量 */
export const runPool = async <T>(
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

/** 将当前内存索引原子持久化到本地磁盘缓存 (data/eagle/index.json) */
export const persistCache = async () => {
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
 * 增量校验核心逻辑：
 * 1. 同步库根 metadata.json 的文件夹树；
 * 2. 尝试读取库根 mtime.json（Eagle 私有变更指纹）；
 * 3. readdir 枚举 images/ 目录以获取实际存在的所有 .info ID；
 * 4. 移除磁盘已消失的条目；
 * 5. 筛选出新目录或 lastModified 不一致的条目，并发加载并更新索引。
 */
const syncIndex = async (libraryPath: string) => {
  // 1. 文件夹树同步
  const rawLibrary = (await fs.readJson(
    path.join(libraryPath, 'metadata.json'),
  )) as { folders?: EagleRawFolder[] }
  const folders = rawLibrary.folders ?? []

  // 2. 变更指纹表（Eagle 私有实现，可能不存在）
  let mtimeMap: Record<string, number> | null = null
  try {
    mtimeMap = await fs.readJson(path.join(libraryPath, 'mtime.json'))
  } catch {
    mtimeMap = null
  }

  // 3. 目录枚举（2 万个目录名在 OS 层面仅需几十毫秒）
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

  // 4. 清理磁盘上已消失的条目
  for (const id of [...items.keys()]) {
    if (!diskIds.has(id)) items.delete(id)
  }

  // 5. 收集新增或 lastModified 变化的条目
  const toLoad: string[] = []
  for (const id of diskIds) {
    const cached = items.get(id)
    if (!cached) {
      toLoad.push(id)
    } else if (mtimeMap && mtimeMap[id] !== undefined) {
      if (mtimeMap[id] !== cached.lastModified) toLoad.push(id)
    }
    // 注：若 mtime.json 缺失则走降级路径：已有条目信任缓存，仅读新目录
  }

  if (toLoad.length > 0) {
    await runPool(toLoad, SCAN_CONCURRENCY, async (id) => {
      const meta = await readItemMeta(libraryPath, id)
      if (!meta) {
        items.delete(id)
        return
      }
      const entry = await buildIndexEntry(libraryPath, meta)
      if (entry) items.set(id, entry)
    })
  }
}

/** 注册文件系统监听器（防抖触发增量刷新） */
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
    // 监听 images/ 目录内条目增删改
    watcher = fs.watch(imagesDir(libraryPath), trigger)
    // 监听库根 metadata.json / mtime.json 变化（文件夹树或全局指纹变更）
    rootWatcher = fs.watch(libraryPath, trigger)
    watcher.on('error', () => {})
    rootWatcher.on('error', () => {})
  } catch (err) {
    console.error('[Eagle] fs.watch 启动失败，变更检测退化为手动刷新', err)
  }
}

/** 尝试从本地持久化缓存文件快速恢复索引 */
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

/** 首次加载流程（冷启动优先恢复缓存，随后后台增量同步并建立监听） */
const initialLoad = async () => {
  const libraryPath = await resolveLibraryPath()
  if (!libraryPath) {
    state = null
    return
  }
  const fromCache = await loadFromCache(libraryPath)
  // 缓存命中先立即可用，随后增量校验；未命中则本次同步全量扫描
  await syncIndex(libraryPath)
  await persistCache()
  scheduleWatcher(libraryPath)
  console.log(
    `[Eagle] 索引就绪：${state?.items.size ?? 0} 个条目（${fromCache ? '缓存+增量' : '全量扫描'}）`,
  )
}

/** 确保索引已加载就绪（首次调用会等待加载完成，多请求并发安全） */
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

/** 手动或监听触发刷新：库路径变化时完全重建，否则执行增量校验并更新缓存 */
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

/** 供 API 层/服务层根据 ID 查询索引条目（含 ID 格式校验） */
export const getItemEntry = async (
  id: string,
): Promise<EagleItemIndex | null> => {
  if (!ITEM_ID_PATTERN.test(id)) return null
  const index = await ensureIndex()
  return index?.items.get(id) ?? null
}

/** 原文件绝对路径（由索引安全解析出真实文件名，不拼接用户输入） */
export const getItemFilePath = async (id: string): Promise<string | null> => {
  const entry = await getItemEntry(id)
  if (!entry || !state) return null
  return path.join(imagesDir(state.libraryPath), `${id}.info`, entry.fileName)
}

/** Eagle 库内预生成的缩略图文件绝对路径，若不存在返回 null */
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
