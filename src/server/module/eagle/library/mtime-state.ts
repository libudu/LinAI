import fs from 'fs-extra'
import path from 'path'
import { writeJsonFile } from '../../../common/storage/json-file'
import { markInternalWrite } from './types'

/**
 * mtime.json 内存化管理与 5 秒防抖合并落盘：
 * Eagle 库根目录下的 mtime.json 记录了所有条目的修改时间戳字典（约 385KB，数万条记录）。
 * 每次整理确认若直接同步读写该文件，会导致严重的磁盘 I/O 阻塞（尤其在 Windows 上配合 fsync）。
 * 通过内存 Map 常驻 + 5 秒防抖落盘，将连续单次/批量确认的写盘开销压缩 95% 以上。
 */

interface MtimeCache {
  libraryPath: string
  map: Record<string, number>
}

let cache: MtimeCache | null = null
let isDirty = false
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let flushPromise: Promise<void> | null = null

const DEBOUNCE_MS = 5000

/** 获取指定库的 mtime.json 路径 */
const getMtimePath = (libraryPath: string) =>
  path.join(libraryPath, 'mtime.json')

/** 确保内存缓存已就绪（首次从磁盘载入，随后直接命中内存） */
export const ensureMtimeLoaded = async (
  libraryPath: string,
): Promise<Record<string, number> | null> => {
  if (cache && cache.libraryPath === libraryPath) {
    return cache.map
  }
  const mtimePath = getMtimePath(libraryPath)
  if (!(await fs.pathExists(mtimePath))) {
    cache = null
    return null
  }
  try {
    const raw = (await fs.readJson(mtimePath)) as Record<string, number>
    cache = {
      libraryPath,
      map: raw && typeof raw === 'object' ? raw : {},
    }
    isDirty = false
    return cache.map
  } catch (err) {
    console.warn('[Eagle] 读取 mtime.json 失败，重置为空字典', err)
    cache = { libraryPath, map: {} }
    isDirty = false
    return cache.map
  }
}

/** 同步或异步立即将内存中的 mtime 刷新到磁盘 */
export const flushMtime = async (libraryPath?: string): Promise<void> => {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  if (!isDirty || !cache) return
  if (libraryPath && cache.libraryPath !== libraryPath) return

  if (flushPromise) {
    return flushPromise
  }

  const doFlush = async () => {
    if (!cache || !isDirty) return
    const targetPath = getMtimePath(cache.libraryPath)
    const data = cache.map
    isDirty = false
    markInternalWrite()
    try {
      await writeJsonFile(targetPath, data, { backup: false })
    } catch (err) {
      console.error('[Eagle] mtime.json 落盘失败', err)
      isDirty = true
    }
  }

  flushPromise = doFlush().finally(() => {
    flushPromise = null
  })
  return flushPromise
}

/**
 * 批量或单项更新条目的 mtime 时间戳：
 * 立即更新内存字典，默认 5 秒防抖合并写盘。
 * @param libraryPath 库根目录
 * @param ids 条目 ID 数组
 * @param timestamp 修改时间戳（毫秒），默认为 Date.now()
 * @param immediate 是否立即强制写盘
 */
export const updateMtimes = async (
  libraryPath: string,
  ids: string[],
  timestamp = Date.now(),
  immediate = false,
): Promise<void> => {
  if (ids.length === 0) return
  const map = await ensureMtimeLoaded(libraryPath)
  if (!map) return

  for (const id of ids) {
    map[id] = timestamp
  }
  isDirty = true

  if (immediate) {
    await flushMtime(libraryPath)
  } else {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      flushMtime().catch((err) =>
        console.error('[Eagle] mtime.json 后台防抖落盘失败', err),
      )
    }, DEBOUNCE_MS)
  }
}

/**
 * 物理删除条目时从 mtime 字典中移除
 */
export const removeMtimes = async (
  libraryPath: string,
  ids: string[],
  immediate = false,
): Promise<void> => {
  if (ids.length === 0) return
  const map = await ensureMtimeLoaded(libraryPath)
  if (!map) return

  for (const id of ids) {
    delete map[id]
  }
  isDirty = true

  if (immediate) {
    await flushMtime(libraryPath)
  } else {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      flushMtime().catch((err) =>
        console.error('[Eagle] mtime.json 后台防抖落盘失败', err),
      )
    }, DEBOUNCE_MS)
  }
}
