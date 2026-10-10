/** 内部索引生命周期：协调缓存恢复、增量扫描与手动刷新。 */
import { EagleChangeJournal } from '../change-journal'
import { getEagleSettings } from '../settings'
import { flushMtime, reloadMtime } from './mtime-state'
import { withLibraryLock } from './runtime'
import { scanIndex } from './scan'
import { IndexShardCache, loadIndexCache } from './shard-cache'
import { indexElapsed, indexNow } from './timing'
import type { EagleIndexState } from './types'

export const libraryChanges = new EagleChangeJournal()

let state: EagleIndexState | null = null
let loadingPromise: Promise<void> | null = null
export const indexCache = new IndexShardCache(() => state)

const syncIndex = async (libraryPath: string) => {
  const startedAt = indexNow()
  const mtimeMap = await reloadMtime(libraryPath)
  console.log(
    `[Eagle] 修改指纹读取：${indexElapsed(startedAt)}，${mtimeMap ? Object.keys(mtimeMap).length : 0} 条${mtimeMap ? '' : '（缺失或损坏，使用本地校验）'}`,
  )
  try {
    const scanned = await scanIndex(libraryPath, state, mtimeMap)
    state = scanned.index
    indexCache.markDirty(scanned.cacheChangedIds)
  } finally {
    // 扫描会原地修改索引；失败后的部分变更也不能继续命中旧查询缓存。
    libraryChanges.reset()
  }
}

const initialLoad = async (libraryPath: string | null) => {
  if (!libraryPath) {
    state = null
    libraryChanges.reset()
    return
  }
  const startedAt = indexNow()
  const cacheStartedAt = indexNow()
  state = await loadIndexCache(libraryPath)
  const fromCache = !!state
  console.log(
    `[Eagle] 索引缓存恢复：${indexElapsed(cacheStartedAt)}，${state?.items.size ?? 0} 个条目${fromCache ? '' : '（无可用缓存）'}`,
  )
  if (!fromCache) indexCache.markAllDirty()
  await syncIndex(libraryPath)
  // 校验仍阻塞首次查询；只有可重建缓存的保存移到后台。
  await indexCache.persist()
  console.log(
    `[Eagle] 索引就绪：${state?.items.size ?? 0} 个条目（${fromCache ? '分片缓存+增量' : '全量扫描'}），启动校验总耗时 ${indexElapsed(startedAt)}（不含后台缓存落盘）`,
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
  const startedAt = indexNow()
  await ensureIndex()
  const libraryPath = (await getEagleSettings()).libraryPath || null
  if (!libraryPath) {
    const clear = async () => {
      await indexCache.flush()
      await flushMtime()
      state = null
      libraryChanges.reset()
      loadingPromise = null
    }
    if (state) await withLibraryLock(state.libraryPath, clear)
    else await clear()
    return
  }
  const refresh = () =>
    withLibraryLock(libraryPath, async () => {
      // 切库前等旧缓存落盘，避免旧分片写入覆盖新库缓存。
      await indexCache.flush()
      if (state?.libraryPath !== libraryPath) {
        await flushMtime()
        await initialLoad(libraryPath)
      } else {
        await syncIndex(libraryPath)
      }
      await indexCache.persist(true)
      await flushMtime(libraryPath)
    })
  // 切库也等待旧库写入完成，避免旧操作的分片收尾写进新库缓存。
  if (state && state.libraryPath !== libraryPath)
    await withLibraryLock(state.libraryPath, refresh)
  else await refresh()
  console.log(`[Eagle] 手动刷新完成：${indexElapsed(startedAt)}`)
}
