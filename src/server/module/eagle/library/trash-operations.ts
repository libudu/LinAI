import { StorageError } from '@/server/common/storage/errors'
import { writeJsonFile } from '@/server/common/storage/json-file'
import fs from 'fs-extra'
import path from 'path'
import { runPool } from '../concurrency'
import { thumbnailCachePath } from '../media/cache'
import { readWritableItemMeta, withLibraryMutation } from './mutation'
import { imagesDir, ITEM_ID_PATTERN, SCAN_CONCURRENCY } from './runtime'
import type { EagleIndexState } from './types'

/** 软删除和还原共用元数据更新，不需要探测或重命名原文件。 */
const setDeleted = async (
  index: EagleIndexState,
  id: string,
  isDeleted: boolean,
  timestamp: number,
) => {
  const meta = await readWritableItemMeta(index.libraryPath, id)
  if (!meta) return false
  await writeJsonFile(
    path.join(imagesDir(index.libraryPath), `${id}.info`, 'metadata.json'),
    {
      ...meta,
      isDeleted,
      lastModified: timestamp,
    },
    { backup: false },
  )
  const entry = index.items.get(id)
  if (entry)
    index.items.set(id, { ...entry, isDeleted, lastModified: timestamp })
  return true
}

const setItemDeleted = async (id: string, isDeleted: boolean) => {
  if (!ITEM_ID_PATTERN.test(id)) return false
  const result = await withLibraryMutation<boolean | null>(
    null,
    async (index, changes) => {
      const ok = await setDeleted(index, id, isDeleted, changes.timestamp)
      if (ok) changes.updated.add(id)
      return ok
    },
  )
  // 不可用的资源库不能伪装成条目缺失，否则整理确认会误跳过结果。
  if (result === null)
    throw new StorageError('REVISION_CONFLICT', 'Eagle 资源库当前不可用')
  return result
}

export const deleteItem = (id: string): Promise<boolean> =>
  setItemDeleted(id, true)
export const restoreItem = (id: string): Promise<boolean> =>
  setItemDeleted(id, false)

/** 原文件删除失败必须保留索引；可重建的缩略图缓存清理失败仅记录。 */
const removeItemFiles = async (index: EagleIndexState, id: string) => {
  await fs.remove(path.join(imagesDir(index.libraryPath), `${id}.info`))
  index.items.delete(id)
  await fs.remove(thumbnailCachePath(id)).catch((error) => {
    console.warn(`[Eagle] 删除缩略图缓存失败：${id}`, error)
  })
}

export const purgeItem = async (id: string): Promise<boolean> => {
  if (!ITEM_ID_PATTERN.test(id)) return false
  return withLibraryMutation(false, async (index, changes) => {
    if (!index.items.has(id)) return false
    await removeItemFiles(index, id)
    changes.removed.add(id)
    return true
  })
}

/** 并发批量操作失败后仍等待已启动工作结束，统一同步真正成功的条目。 */
export const purgeTrash = (): Promise<number> =>
  withLibraryMutation(0, async (index, changes) => {
    const ids = [...index.items.values()]
      .filter((item) => item.isDeleted)
      .map((item) => item.id)
    await runPool(ids, SCAN_CONCURRENCY, async (id) => {
      await removeItemFiles(index, id)
      changes.removed.add(id)
    })
    return changes.removed.size
  })

export const trashUnclassified = (): Promise<number> =>
  withLibraryMutation(0, async (index, changes) => {
    const ids = [...index.items.values()]
      .filter((item) => !item.isDeleted && item.folders.length === 0)
      .map((item) => item.id)
    await runPool(ids, SCAN_CONCURRENCY, async (id) => {
      if (await setDeleted(index, id, true, changes.timestamp))
        changes.updated.add(id)
    })
    return changes.updated.size
  })
