import { changeBus } from '@/server/common/storage/change-bus'
import fs from 'fs-extra'
import path from 'path'
import { ensureIndex, indexCache } from './index-state'
import { ensureMtimeLoaded, removeMtimes, updateMtimes } from './mtime-state'
import { EAGLE_LIBRARY_RESOURCE, imagesDir, withLibraryLock } from './runtime'
import type { EagleIndexState, EagleRawItemMeta } from './types'

interface LibraryChanges {
  updated: Set<string>
  removed: Set<string>
  timestamp: number
}

/** 写操作不能把权限错误或损坏元数据伪装成条目不存在。 */
export const readWritableItemMeta = async (
  libraryPath: string,
  id: string,
): Promise<EagleRawItemMeta | null> => {
  try {
    return await fs.readJson(
      path.join(imagesDir(libraryPath), `${id}.info`, 'metadata.json'),
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

/** 同步已完成的写入；批次后续项失败也必须保存成功项的指纹、缓存并发布事件。 */
const commitChanges = async (
  index: EagleIndexState,
  changes: LibraryChanges,
) => {
  const updated = [...changes.updated]
  const removed = [...changes.removed]
  const ids = [...updated, ...removed]
  if (ids.length === 0) return
  try {
    await updateMtimes(index.libraryPath, updated, changes.timestamp)
    await removeMtimes(index.libraryPath, removed)
  } finally {
    indexCache.markDirty(ids)
    try {
      await indexCache.persist()
    } finally {
      changeBus.publish({ resource: EAGLE_LIBRARY_RESOURCE })
    }
  }
}

/** 同一库内串行写入。先加载指纹，避免写入条目后才发现库根不可读。 */
export const withLibraryMutation = async <T>(
  fallback: T,
  action: (index: EagleIndexState, changes: LibraryChanges) => Promise<T>,
): Promise<T> => {
  const index = await ensureIndex()
  if (!index) return fallback
  return withLibraryLock(index.libraryPath, async () => {
    await ensureMtimeLoaded(index.libraryPath)
    const changes: LibraryChanges = {
      updated: new Set(),
      removed: new Set(),
      timestamp: Date.now(),
    }
    try {
      return await action(index, changes)
    } finally {
      await commitChanges(index, changes)
    }
  })
}
