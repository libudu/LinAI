/** 内部索引生命周期：协调缓存恢复、增量扫描与手动刷新。 */
import { getEagleSettings } from '../settings'
import { flushMtime, reloadMtime } from './mtime-state'
import { withLibraryLock } from './runtime'
import { scanIndex } from './scan'
import { IndexShardCache, loadIndexCache } from './shard-cache'
import type { EagleIndexState } from './types'

let state: EagleIndexState | null = null
let loadingPromise: Promise<void> | null = null
export const indexCache = new IndexShardCache(() => state)

const syncIndex = async (libraryPath: string) => {
  const mtimeMap = await reloadMtime(libraryPath)
  const scanned = await scanIndex(libraryPath, state, mtimeMap)
  state = scanned.index
  indexCache.markDirty(scanned.changedIds)
}

const initialLoad = async (libraryPath: string | null) => {
  if (!libraryPath) {
    state = null
    return
  }
  state = await loadIndexCache(libraryPath)
  const fromCache = !!state
  if (!fromCache) indexCache.markAllDirty()
  await syncIndex(libraryPath)
  await indexCache.persist(true)
  console.log(
    `[Eagle] 索引就绪：${state?.items.size ?? 0} 个条目（${fromCache ? '分片缓存+增量' : '全量扫描'}）`,
  )
}

/** 内部读写模块使用的可变索引；不通过 library 门面导出。 */
export const ensureIndex = async (): Promise<EagleIndexState | null> => {
  if (!loadingPromise) {
    loadingPromise = getEagleSettings()
      .then((settings) => initialLoad(settings.libraryPath || null))
      .catch((error) => {
        loadingPromise = null
        console.error('[Eagle] 索引加载失败', error)
        throw error
      })
  }
  await loadingPromise
  return state
}

/** 手动刷新重新读取磁盘 mtime，同时保留尚未落盘的本应用改动。 */
export const refreshIndex = async (): Promise<void> => {
  await ensureIndex()
  const libraryPath = (await getEagleSettings()).libraryPath || null
  if (!libraryPath) {
    await indexCache.flush()
    await flushMtime()
    state = null
    loadingPromise = null
    return
  }
  await withLibraryLock(libraryPath, async () => {
    // 切库前等旧缓存落盘，避免旧分片写入覆盖新库缓存。
    await indexCache.flush()
    if (state?.libraryPath !== libraryPath) {
      await flushMtime()
      await initialLoad(libraryPath)
    } else {
      await syncIndex(libraryPath)
      await indexCache.persist(true)
    }
    await flushMtime(libraryPath)
  })
}
