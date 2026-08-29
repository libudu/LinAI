/**
 * Eagle 资源库写操作与持久化同步。
 *
 * 核心操作：
 * 1. updateFolder: 修改库根 metadata.json 文件夹名称/描述并原子写回；
 * 2. updateItem: 条目改名（含磁盘原文件/缩略图重命名与序号去重冲突处理）、移动文件夹、软删除标记更新；
 * 3. deleteItem / restoreItem: Eagle 规范的回收站软删除标记变更（isDeleted: true/false）；
 * 4. purgeItem / purgeTrash: 物理彻底删除磁盘 .info 目录与缩略图缓存；
 *
 * 同步闭环链：
 * 磁盘文件/元数据变更 -> 库根 mtime.json 变更指纹更新 -> 内存索引与持久化缓存同步 -> changeBus 发布 eagle.library 广播事件。
 */

import fs from 'fs-extra'
import path from 'path'
import { changeBus } from '../../../common/storage/change-bus'
import { ensureIndex, persistCache, readItemMeta, runPool } from './index-state'
import { findRawFolder } from './query'
import {
  EAGLE_LIBRARY_RESOURCE,
  type EagleRawFolder,
  type EagleRawItemMeta,
  imagesDir,
  ITEM_ID_PATTERN,
  sanitizeItemName,
  SCAN_CONCURRENCY,
  THUMB_DIR,
  type UpdateItemPatch,
} from './types'

/**
 * 编辑文件夹名称/描述（写回库根 metadata.json，原子写入，保留其他字段）。
 * 这是本模块对库根 metadata.json 唯一的写操作。返回 false 表示目标文件夹不存在。
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
  // 同步内存中的文件夹树（fs.watch 也会触发增量校验，这里先立即生效）
  index.folders = rawLibrary.folders ?? []
  return true
}

/**
 * 编辑条目（图片整理确认动作）：改标题（含重命名 .info 内原文件/缩略图）与所属文件夹。
 *
 * 同步链路：
 * 1. 标题清理与同名序号冲突处理（targetName、targetName (1)...）；
 * 2. 磁盘重命名原文件及 `_thumbnail` 缩略图文件；
 * 3. 写入条目自身的 metadata.json；
 * 4. 同步更新库根 mtime.json（保持 Eagle 官方指纹一致）；
 * 5. 更新内存索引并写回 data/eagle/index.json；
 * 6. 通过 changeBus 发布 eagle.library 变更通知。
 *
 * 返回 false 表示条目不存在；同名冲突超过 99 时抛出异常。
 */
export const updateItem = async (
  id: string,
  patch: UpdateItemPatch,
): Promise<boolean> => {
  if (!ITEM_ID_PATTERN.test(id)) return false
  const index = await ensureIndex()
  if (!index) return false
  const entry = index.items.get(id)
  if (!entry) return false
  const meta = await readItemMeta(index.libraryPath, id)
  if (!meta) return false

  // 计算最终条目名（AI 建议标题可能含非法字符，清理后若为空则保持原名）
  let targetName = meta.name
  if (patch.name !== undefined) {
    const sanitized = sanitizeItemName(patch.name)
    if (sanitized) targetName = sanitized
  }

  const infoDir = path.join(imagesDir(index.libraryPath), `${id}.info`)
  const oldFileName = entry.fileName
  const oldFilePath = path.join(infoDir, oldFileName)
  // 原文件 stat（改名 move 不改内容 mtime，条目 mtime 字段保持原值）
  let fileStat: fs.Stats | null = null
  try {
    fileStat = await fs.stat(oldFilePath)
  } catch {
    // 原文件缺失时仍允许修改元数据
  }

  let fileName = oldFileName
  let thumbnailName = entry.thumbnailName
  if (targetName !== meta.name) {
    // 同名冲突时文件名追加序号，条目名同步（Eagle 用条目名定位原文件）
    for (let suffix = 0; ; suffix++) {
      const candidate = suffix === 0 ? targetName : `${targetName} (${suffix})`
      const candidateFile = `${candidate}.${entry.ext}`
      // 仅大小写差异时 pathExists 会命中旧文件本身，视为合法改名
      const isOldItself =
        candidateFile.toLowerCase() === oldFileName.toLowerCase()
      if (
        isOldItself ||
        !(await fs.pathExists(path.join(infoDir, candidateFile)))
      ) {
        targetName = candidate
        fileName = candidateFile
        break
      }
      if (suffix >= 99)
        throw new Error(`重命名冲突：${targetName}.${entry.ext} 已存在`)
    }
    await fs.move(oldFilePath, path.join(infoDir, fileName), {
      overwrite: true,
    })
    // Eagle 缩略图命名跟随条目名（<name>_thumbnail.<ext>），匹配旧名时同步重命名
    if (thumbnailName) {
      const thumbExt = path.extname(thumbnailName)
      const oldThumbBase = path.basename(thumbnailName, thumbExt)
      if (
        oldThumbBase.toLowerCase() === `${meta.name}_thumbnail`.toLowerCase()
      ) {
        const newThumb = `${targetName}_thumbnail${thumbExt}`
        const newThumbPath = path.join(infoDir, newThumb)
        if (
          newThumb.toLowerCase() !== thumbnailName.toLowerCase() &&
          !(await fs.pathExists(newThumbPath))
        ) {
          await fs.move(path.join(infoDir, thumbnailName), newThumbPath)
          thumbnailName = newThumb
        }
      }
    }
  }

  const lastModified = Date.now()
  const folders = patch.folderIds ?? meta.folders
  let isDeleted = meta.isDeleted === true
  if (patch.isDeleted !== undefined) {
    isDeleted = patch.isDeleted
  } else if (patch.folderIds !== undefined && isDeleted) {
    isDeleted = false
  }

  const nextMeta: EagleRawItemMeta = {
    ...meta,
    name: targetName,
    folders,
    isDeleted: isDeleted ? true : undefined,
    lastModified,
    mtime: fileStat ? Math.round(fileStat.mtimeMs) : meta.mtime,
  }
  const metaPath = path.join(infoDir, 'metadata.json')
  const metaTmp = `${metaPath}.tmp`
  await fs.writeJson(metaTmp, nextMeta)
  await fs.move(metaTmp, metaPath, { overwrite: true })

  // 同步库根 mtime.json（保持与 Eagle 行为一致）；若该文件原本不存在则不创建
  const mtimePath = path.join(index.libraryPath, 'mtime.json')
  if (await fs.pathExists(mtimePath)) {
    let mtimeMap: Record<string, number> = {}
    try {
      mtimeMap = await fs.readJson(mtimePath)
    } catch {
      // 损坏则仅保留本次条目
    }
    mtimeMap[id] = lastModified
    const mtimeTmp = `${mtimePath}.tmp`
    await fs.writeJson(mtimeTmp, mtimeMap)
    await fs.move(mtimeTmp, mtimePath, { overwrite: true })
  }

  // 内存索引与本地缓存同步
  index.items.set(id, {
    ...entry,
    name: targetName,
    fileName,
    thumbnailName,
    folders: folders ?? [],
    isDeleted,
    mtime: nextMeta.mtime,
    lastModified,
  })
  await persistCache()
  changeBus.publish({ resource: EAGLE_LIBRARY_RESOURCE })
  return true
}

/**
 * 移入 Eagle 回收站：软删除条目（设置 isDeleted: true，同步 mtime.json 与内存索引）。
 * 不物理删除磁盘原文件与目录，与 Eagle 官方回收站逻辑完全一致。
 */
export const deleteItem = async (id: string): Promise<boolean> => {
  if (!ITEM_ID_PATTERN.test(id)) return false
  const index = await ensureIndex()
  if (!index) return false
  const meta = await readItemMeta(index.libraryPath, id)
  if (!meta) return false

  const lastModified = Date.now()
  const nextMeta: EagleRawItemMeta = {
    ...meta,
    isDeleted: true,
    lastModified,
  }
  const infoDir = path.join(imagesDir(index.libraryPath), `${id}.info`)
  const metaPath = path.join(infoDir, 'metadata.json')
  const metaTmp = `${metaPath}.tmp`
  await fs.writeJson(metaTmp, nextMeta)
  await fs.move(metaTmp, metaPath, { overwrite: true })

  // 同步库根 mtime.json
  const mtimePath = path.join(index.libraryPath, 'mtime.json')
  if (await fs.pathExists(mtimePath)) {
    let mtimeMap: Record<string, number> = {}
    try {
      mtimeMap = await fs.readJson(mtimePath)
    } catch {}
    mtimeMap[id] = lastModified
    const mtimeTmp = `${mtimePath}.tmp`
    await fs.writeJson(mtimeTmp, mtimeMap)
    await fs.move(mtimeTmp, mtimePath, { overwrite: true })
  }

  // 同步内存索引与缓存
  const entry = index.items.get(id)
  if (entry) {
    index.items.set(id, {
      ...entry,
      isDeleted: true,
      lastModified,
    })
  }
  await persistCache()
  changeBus.publish({ resource: EAGLE_LIBRARY_RESOURCE })
  return true
}

/**
 * 从 Eagle 回收站恢复条目：取消软删除（设置 isDeleted: false，同步 mtime.json 与内存索引）。
 */
export const restoreItem = async (id: string): Promise<boolean> => {
  if (!ITEM_ID_PATTERN.test(id)) return false
  const index = await ensureIndex()
  if (!index) return false
  const meta = await readItemMeta(index.libraryPath, id)
  if (!meta) return false

  const lastModified = Date.now()
  const nextMeta: EagleRawItemMeta = {
    ...meta,
    isDeleted: false,
    lastModified,
  }
  const infoDir = path.join(imagesDir(index.libraryPath), `${id}.info`)
  const metaPath = path.join(infoDir, 'metadata.json')
  const metaTmp = `${metaPath}.tmp`
  await fs.writeJson(metaTmp, nextMeta)
  await fs.move(metaTmp, metaPath, { overwrite: true })

  // 同步库根 mtime.json
  const mtimePath = path.join(index.libraryPath, 'mtime.json')
  if (await fs.pathExists(mtimePath)) {
    let mtimeMap: Record<string, number> = {}
    try {
      mtimeMap = await fs.readJson(mtimePath)
    } catch {}
    mtimeMap[id] = lastModified
    const mtimeTmp = `${mtimePath}.tmp`
    await fs.writeJson(mtimeTmp, mtimeMap)
    await fs.move(mtimeTmp, mtimePath, { overwrite: true })
  }

  // 同步内存索引与缓存
  const entry = index.items.get(id)
  if (entry) {
    index.items.set(id, {
      ...entry,
      isDeleted: false,
      lastModified,
    })
  }
  await persistCache()
  changeBus.publish({ resource: EAGLE_LIBRARY_RESOURCE })
  return true
}

/**
 * 彻底删除单个条目：从磁盘物理删除 images/<id>.info 目录与缩略图缓存，
 * 同步 mtime.json 与内存索引。此操作不可逆。
 */
export const purgeItem = async (id: string): Promise<boolean> => {
  if (!ITEM_ID_PATTERN.test(id)) return false
  const index = await ensureIndex()
  if (!index) return false
  const entry = index.items.get(id)
  if (!entry) return false

  const infoDir = path.join(imagesDir(index.libraryPath), `${id}.info`)
  await fs.remove(infoDir).catch(() => {})
  const thumbFile = path.join(THUMB_DIR, `${id}.webp`)
  await fs.remove(thumbFile).catch(() => {})

  // 同步库根 mtime.json
  const mtimePath = path.join(index.libraryPath, 'mtime.json')
  if (await fs.pathExists(mtimePath)) {
    let mtimeMap: Record<string, number> = {}
    try {
      mtimeMap = await fs.readJson(mtimePath)
    } catch {}
    delete mtimeMap[id]
    const mtimeTmp = `${mtimePath}.tmp`
    await fs.writeJson(mtimeTmp, mtimeMap)
    await fs.move(mtimeTmp, mtimePath, { overwrite: true })
  }

  // 从内存索引与缓存中移除
  index.items.delete(id)
  await persistCache()
  changeBus.publish({ resource: EAGLE_LIBRARY_RESOURCE })
  return true
}

/**
 * 彻底删除回收站下所有条目（清空回收站）：物理删除全部 isDeleted 条目的
 * images/<id>.info 目录与缩略图缓存，同步 mtime.json 与内存索引。
 */
export const purgeTrash = async (): Promise<number> => {
  const index = await ensureIndex()
  if (!index) return 0

  const trashIds = [...index.items.values()]
    .filter((item) => item.isDeleted === true)
    .map((item) => item.id)

  if (trashIds.length === 0) return 0

  await runPool(trashIds, SCAN_CONCURRENCY, async (id) => {
    const infoDir = path.join(imagesDir(index.libraryPath), `${id}.info`)
    await fs.remove(infoDir).catch(() => {})
    const thumbFile = path.join(THUMB_DIR, `${id}.webp`)
    await fs.remove(thumbFile).catch(() => {})
    index.items.delete(id)
  })

  // 同步库根 mtime.json
  const mtimePath = path.join(index.libraryPath, 'mtime.json')
  if (await fs.pathExists(mtimePath)) {
    let mtimeMap: Record<string, number> = {}
    try {
      mtimeMap = await fs.readJson(mtimePath)
    } catch {}
    for (const id of trashIds) {
      delete mtimeMap[id]
    }
    const mtimeTmp = `${mtimePath}.tmp`
    await fs.writeJson(mtimeTmp, mtimeMap)
    await fs.move(mtimeTmp, mtimePath, { overwrite: true })
  }

  await persistCache()
  changeBus.publish({ resource: EAGLE_LIBRARY_RESOURCE })
  return trashIds.length
}

/**
 * 将未分类目录下的所有条目移入 Eagle 回收站（软删除，设置 isDeleted: true，同步 mtime.json 与内存索引）。
 */
export const trashUnclassified = async (): Promise<number> => {
  const index = await ensureIndex()
  if (!index) return 0

  const unclassifiedIds = [...index.items.values()]
    .filter((item) => !item.isDeleted && item.folders.length === 0)
    .map((item) => item.id)

  if (unclassifiedIds.length === 0) return 0

  const now = Date.now()
  await runPool(unclassifiedIds, SCAN_CONCURRENCY, async (id) => {
    const meta = await readItemMeta(index.libraryPath, id)
    if (!meta) return
    const nextMeta: EagleRawItemMeta = {
      ...meta,
      isDeleted: true,
      lastModified: now,
    }
    const infoDir = path.join(imagesDir(index.libraryPath), `${id}.info`)
    const metaPath = path.join(infoDir, 'metadata.json')
    const metaTmp = `${metaPath}.tmp`
    await fs.writeJson(metaTmp, nextMeta)
    await fs.move(metaTmp, metaPath, { overwrite: true })

    const entry = index.items.get(id)
    if (entry) {
      index.items.set(id, {
        ...entry,
        isDeleted: true,
        lastModified: now,
      })
    }
  })

  // 同步库根 mtime.json
  const mtimePath = path.join(index.libraryPath, 'mtime.json')
  if (await fs.pathExists(mtimePath)) {
    let mtimeMap: Record<string, number> = {}
    try {
      mtimeMap = await fs.readJson(mtimePath)
    } catch {}
    for (const id of unclassifiedIds) {
      mtimeMap[id] = now
    }
    const mtimeTmp = `${mtimePath}.tmp`
    await fs.writeJson(mtimeTmp, mtimeMap)
    await fs.move(mtimeTmp, mtimePath, { overwrite: true })
  }

  await persistCache()
  changeBus.publish({ resource: EAGLE_LIBRARY_RESOURCE })
  return unclassifiedIds.length
}
