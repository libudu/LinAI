import { changeBus } from '@/server/common/storage/change-bus'
import { writeJsonFile } from '@/server/common/storage/json-file'
import fs from 'fs-extra'
import path from 'path'
import { findRawFolder } from './folders'
import { ensureIndex } from './index-state'
import { EAGLE_LIBRARY_RESOURCE, withLibraryLock } from './runtime'
import type { EagleRawFolder } from './types'

/** 原子写回库根文件夹树，保留 Eagle 的其他元数据字段。 */
export const updateFolder = async (
  id: string,
  patch: { name: string; description: string },
): Promise<boolean> => {
  const index = await ensureIndex()
  if (!index) return false
  return withLibraryLock(index.libraryPath, async () => {
    const metaPath = path.join(index.libraryPath, 'metadata.json')
    const rawLibrary = (await fs.readJson(metaPath)) as {
      folders?: EagleRawFolder[]
    }
    const target = findRawFolder(rawLibrary.folders ?? [], id)
    if (!target) return false
    target.name = patch.name
    target.description = patch.description
    await writeJsonFile(metaPath, rawLibrary, { backup: false })
    index.folders = rawLibrary.folders ?? []
    changeBus.publish({ resource: EAGLE_LIBRARY_RESOURCE })
    return true
  })
}
