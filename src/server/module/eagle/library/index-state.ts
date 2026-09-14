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
import { writeJsonFile } from '../../../common/storage/json-file'
import { getEagleSettings } from '../settings'
import {
  INDEX_META_FILE,
  INDEX_SHARDS_DIR,
  SHARD_COUNT,
  type EagleIndexShardMeta,
  type EagleIndexState,
  type EagleItemIndex,
  type EagleRawFolder,
  type EagleRawItemMeta,
  getLastInternalWriteAt,
  getShardKey,
  imagesDir,
  ITEM_ID_PATTERN,
  markInternalWrite,
  SCAN_CONCURRENCY,
  WATCH_DEBOUNCE_MS,
  withLibraryLock,
} from './types'
import { ensureMtimeLoaded, flushMtime } from './mtime-state'

export { markInternalWrite }

let state: EagleIndexState | null = null
let loadingPromise: Promise<void> | null = null
let watcher: fs.FSWatcher | null = null
let rootWatcher: fs.FSWatcher | null = null
let watchTimer: ReturnType<typeof setTimeout> | null = null

/** 脏分片集合：记录发生了条目新增、更新、删除的分片 key */
const dirtyShards = new Set<string>()
let isAllShardsDirty = false

/** 标记单个条目所属分片为脏分片 */
export const markShardDirty = (id: string) => {
  if (isAllShardsDirty) return
  dirtyShards.add(getShardKey(id))
}

/** 批量标记多个条目所属分片为脏分片 */
export const markShardsDirty = (ids: string[]) => {
  if (isAllShardsDirty) return
  for (const id of ids) {
    dirtyShards.add(getShardKey(id))
  }
}

/** 标记所有分片为脏分片（全量扫描或迁移场景） */
export const markAllShardsDirty = () => {
  isAllShardsDirty = true
}

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


let writeCachePromise: Promise<void> | null = null
let hasPendingWrite = false
let persistCacheTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 本地索引缓存 (data/eagle/index-shards/) 防抖落盘时间（毫秒）。
 * 设置为 5000ms（5 秒）：
 * 1. 在用户快速或连续批量确认图片时，有充足的时间窗口将多个批次合并写入；
 * 2. 配合分片机制，每次仅写发生变动的少数脏分片（几百 KB），从根本上消除磁盘 I/O 阻塞；
 * 3. 内存索引（state.items）始终同步即时更新，所有读请求立即可见，防抖仅延迟本地持久化缓存文件写入。
 */
const PERSIST_CACHE_DEBOUNCE_MS = 5000

/**
 * 立即将内存索引分片持久化到本地磁盘目录 (data/eagle/index-shards/)。
 * 核心优化：
 * 仅对 dirtyShards 中的分片文件执行并发原子写盘，绝大部分未变动的分片跳过，
 * 每次写盘仅重写数百 KB，消除 95% 以上的重复 I/O。
 */
export const flushPersistCache = async (): Promise<void> => {
  if (persistCacheTimer) {
    clearTimeout(persistCacheTimer)
    persistCacheTimer = null
  }
  if (!state) return
  if (writeCachePromise) {
    hasPendingWrite = true
    return writeCachePromise
  }

  const doWrite = async () => {
    while (state) {
      hasPendingWrite = false
      await fs.ensureDir(INDEX_SHARDS_DIR)

      // 确定本次需要写入的分片集合
      const shardsToWrite = isAllShardsDirty
        ? Array.from({ length: SHARD_COUNT }, (_, i) =>
            i.toString(16).padStart(2, '0'),
          )
        : Array.from(dirtyShards)

      // 重置脏标记
      isAllShardsDirty = false
      dirtyShards.clear()

      if (shardsToWrite.length > 0) {
        // 按分片分组当前内存中的条目
        const shardBuckets = new Map<string, EagleItemIndex[]>()
        for (const shard of shardsToWrite) {
          shardBuckets.set(shard, [])
        }
        for (const item of state.items.values()) {
          const key = getShardKey(item.id)
          const bucket = shardBuckets.get(key)
          if (bucket) {
            bucket.push(item)
          }
        }

        // 并发池并行写入脏分片文件
        await runPool(shardsToWrite, 16, async (shardKey) => {
          const items = shardBuckets.get(shardKey) ?? []
          const shardPath = path.join(INDEX_SHARDS_DIR, `${shardKey}.json`)
          await writeJsonFile(shardPath, items, { backup: false })
        })
      }

      // 写入主元数据文件
      const meta: EagleIndexShardMeta = {
        libraryPath: state.libraryPath,
        scannedAt: Date.now(),
        shardCount: SHARD_COUNT,
      }
      await writeJsonFile(INDEX_META_FILE, meta, { backup: false })
      await flushMtime(state.libraryPath)

      if (!hasPendingWrite) break
    }
  }

  writeCachePromise = doWrite().finally(() => {
    writeCachePromise = null
  })
  return writeCachePromise
}

/**
 * 将当前内存索引持久化到本地分片磁盘缓存 (data/eagle/index-shards/)。
 * 默认采用 5 秒防抖合并落盘策略：
 * 连续批量确认期间，仅更新内存索引与脏分片标记，
 * 到期后仅并发写入发生变动的少数分片（几百 KB），消除重度 I/O 阻塞。
 * 若指定 immediate = true 则立即同步落盘。
 */
export const persistCache = async (immediate = false): Promise<void> => {
  if (immediate) {
    return flushPersistCache()
  }
  if (persistCacheTimer) {
    clearTimeout(persistCacheTimer)
  }
  persistCacheTimer = setTimeout(() => {
    persistCacheTimer = null
    flushPersistCache().catch((err) =>
      console.error('[Eagle] 索引分片缓存后台防抖落盘失败', err),
    )
  }, PERSIST_CACHE_DEBOUNCE_MS)
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

  // 2. 变更指纹表（Eagle 私有实现，可能不存在，优先命中内存缓存）
  const mtimeMap = await ensureMtimeLoaded(libraryPath)

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
  const removedIds: string[] = []
  for (const id of [...items.keys()]) {
    if (!diskIds.has(id)) {
      items.delete(id)
      removedIds.push(id)
    }
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

  if (toLoad.length > 0 || removedIds.length > 0) {
    markShardsDirty([...toLoad, ...removedIds])
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
      // 若距离上一次内部写操作不足 1500ms，说明是自身写操作触发的 watcher 事件，跳过冗余的全量增量校验
      if (Date.now() - getLastInternalWriteAt() < 1500) {
        return
      }
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

/** 尝试从本地分片缓存 (data/eagle/index-shards/) 快速恢复索引 */
const loadFromCache = async (libraryPath: string): Promise<boolean> => {
  try {
    const metaExists = await fs.pathExists(INDEX_META_FILE)
    if (metaExists) {
      const meta = (await fs.readJson(INDEX_META_FILE)) as EagleIndexShardMeta
      if (meta.libraryPath === libraryPath && meta.shardCount === SHARD_COUNT) {
        const shardKeys = Array.from({ length: SHARD_COUNT }, (_, i) =>
          i.toString(16).padStart(2, '0'),
        )
        const items = new Map<string, EagleItemIndex>()
        await runPool(shardKeys, 16, async (shardKey) => {
          const shardPath = path.join(INDEX_SHARDS_DIR, `${shardKey}.json`)
          try {
            if (await fs.pathExists(shardPath)) {
              const shardItems =
                (await fs.readJson(shardPath)) as EagleItemIndex[]
              if (Array.isArray(shardItems)) {
                for (const item of shardItems) {
                  if (item?.id) items.set(item.id, item)
                }
              }
            }
          } catch {
            // 单个分片损坏容错
          }
        })
        state = { libraryPath, folders: [], items }
        return true
      }
    }
  } catch (error) {
    console.warn('[Eagle] 读取分片索引缓存失败', error)
  }

  return false
}

/** 首次加载流程（冷启动优先恢复缓存，随后后台增量同步并建立监听） */
const initialLoad = async () => {
  const libraryPath = await resolveLibraryPath()
  if (!libraryPath) {
    state = null
    return
  }
  const fromCache = await loadFromCache(libraryPath)
  if (!fromCache) {
    markAllShardsDirty()
  }
  // 缓存命中先立即可用，随后增量校验；未命中则本次同步全量扫描
  await syncIndex(libraryPath)
  await persistCache(true)
  scheduleWatcher(libraryPath)
  console.log(
    `[Eagle] 索引就绪：${state?.items.size ?? 0} 个条目（${fromCache ? '分片缓存+增量' : '全量扫描'}）`,
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

/** 手动或监听触发刷新：库路径变化时完全重建，否则执行增量校验并更新缓存（库级串行互斥） */
export const refreshIndex = async (): Promise<void> => {
  const libraryPath = await resolveLibraryPath()
  if (!libraryPath) {
    state = null
    return
  }
  await withLibraryLock(libraryPath, async () => {
    if (!state || state.libraryPath !== libraryPath) {
      loadingPromise = null
      await ensureIndex()
      return
    }
    await syncIndex(libraryPath)
    await persistCache(true)
  })
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
