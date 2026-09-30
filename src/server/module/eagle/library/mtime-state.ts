/** Eagle 修改指纹：内存即时更新，5 秒合并落盘；刷新显式重读磁盘。 */
import fs from 'fs-extra'
import path from 'path'
import { writeJsonFile } from '../../../common/storage/json-file'

interface MtimeCache {
  libraryPath: string
  map: Record<string, number>
}
let cache: MtimeCache | null = null
const dirtyIds = new Set<string>()
let timer: ReturnType<typeof setTimeout> | null = null
let flushPromise: Promise<void> | null = null

const readMtime = async (
  libraryPath: string,
): Promise<Record<string, number> | null> => {
  const file = path.join(libraryPath, 'mtime.json')
  try {
    const raw: unknown = await fs.readJson(file)
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    return Object.fromEntries(
      Object.entries(raw).filter(([, value]) => typeof value === 'number'),
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    if (!(error instanceof SyntaxError)) throw error
    console.warn('[Eagle] 读取 mtime.json 失败，扫描将回退到条目元数据', error)
    return null
  }
}

/** 业务写操作读取已加载字典，不反复读取全库指纹。 */
export const ensureMtimeLoaded = async (
  libraryPath: string,
): Promise<Record<string, number> | null> => {
  if (cache?.libraryPath === libraryPath) return cache.map
  return reloadMtime(libraryPath)
}

/** 扫描必须显式重读磁盘，叠加尚未落盘的本应用修改，避免刷新丢失待写指纹。 */
export const reloadMtime = async (
  libraryPath: string,
): Promise<Record<string, number> | null> => {
  if (flushPromise) await flushPromise
  if (cache && cache.libraryPath !== libraryPath) await flushMtime()
  const disk = await readMtime(libraryPath)
  const local = cache?.libraryPath === libraryPath ? cache : null
  if (!disk && (!local || dirtyIds.size === 0)) {
    cache = null
    return null
  }
  const map = disk ?? {}
  if (local) {
    for (const id of dirtyIds) {
      if (local.map[id] === undefined) delete map[id]
      else map[id] = local.map[id]
    }
  }
  cache = { libraryPath, map }
  // 指纹文件缺失或损坏时让扫描重读元数据；保留 cache 供待写操作恢复。
  return disk ? map : null
}

/** 保存时仅覆盖本应用改动过的 ID，保留外部 Eagle 客户端的其他指纹。 */
export const flushMtime = async (libraryPath?: string): Promise<void> => {
  if (timer) clearTimeout(timer)
  timer = null
  if (flushPromise) {
    await flushPromise
    return flushMtime(libraryPath)
  }
  if (
    !cache ||
    dirtyIds.size === 0 ||
    (libraryPath && cache.libraryPath !== libraryPath)
  )
    return
  const write = async () => {
    while (cache && dirtyIds.size > 0) {
      const current = cache
      const ids = [...dirtyIds]
      const patch = new Map(ids.map((id) => [id, current.map[id]]))
      dirtyIds.clear()
      try {
        const disk = (await readMtime(current.libraryPath)) ?? {}
        for (const [id, value] of patch) {
          if (value === undefined) delete disk[id]
          else disk[id] = value
        }
        await writeJsonFile(
          path.join(current.libraryPath, 'mtime.json'),
          disk,
          { backup: false },
        )
      } catch (error) {
        for (const id of ids) dirtyIds.add(id)
        throw error
      }
    }
  }
  flushPromise = write().finally(() => {
    flushPromise = null
  })
  return flushPromise
}

const scheduleFlush = async (immediate: boolean) => {
  if (immediate) return flushMtime()
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    flushMtime().catch((error) =>
      console.error('[Eagle] mtime.json 后台落盘失败', error),
    )
  }, 5000)
}

export const updateMtimes = async (
  libraryPath: string,
  ids: string[],
  timestamp = Date.now(),
  immediate = false,
): Promise<void> => {
  if (ids.length === 0) return
  await ensureMtimeLoaded(libraryPath)
  cache ??= { libraryPath, map: {} }
  for (const id of ids) {
    cache.map[id] = timestamp
    dirtyIds.add(id)
  }
  await scheduleFlush(immediate)
}

export const removeMtimes = async (
  libraryPath: string,
  ids: string[],
  immediate = false,
): Promise<void> => {
  if (ids.length === 0) return
  await ensureMtimeLoaded(libraryPath)
  cache ??= { libraryPath, map: {} }
  for (const id of ids) {
    delete cache.map[id]
    dirtyIds.add(id)
  }
  await scheduleFlush(immediate)
}
