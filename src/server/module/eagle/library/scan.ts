/** 条目元数据投影与增量扫描；生命周期与分片保存由调用方协调。 */
import fs from 'fs-extra'
import path from 'path'
import { runPool } from '../concurrency'
import { imagesDir, SCAN_CONCURRENCY } from './runtime'
import { indexElapsed, indexNow } from './timing'
import type {
  EagleIndexState,
  EagleItemIndex,
  EagleItemScanFingerprint,
  EagleRawFolder,
  EagleRawItemMeta,
} from './types'

/** 元数据内容变化看文件属性；原文件/缩略图新增、删除、改名看条目目录属性。 */
const readScanFingerprint = async (
  libraryPath: string,
  id: string,
): Promise<EagleItemScanFingerprint | undefined> => {
  const dir = path.join(imagesDir(libraryPath), `${id}.info`)
  try {
    const [metadata, directory] = await Promise.all([
      fs.stat(path.join(dir, 'metadata.json')),
      fs.stat(dir),
    ])
    return {
      metadataMtimeMs: metadata.mtimeMs,
      metadataCtimeMs: metadata.ctimeMs,
      metadataSize: metadata.size,
      directoryMtimeMs: directory.mtimeMs,
      directoryCtimeMs: directory.ctimeMs,
    }
  } catch {
    // 无法确认时回退到元数据读取，不能直接信任旧索引。
    return undefined
  }
}

const sameScanFingerprint = (
  a: EagleItemScanFingerprint | undefined,
  b: EagleItemScanFingerprint | undefined,
) =>
  !a || !b
    ? a === b
    : a.metadataMtimeMs === b.metadataMtimeMs &&
      a.metadataCtimeMs === b.metadataCtimeMs &&
      a.metadataSize === b.metadataSize &&
      a.directoryMtimeMs === b.directoryMtimeMs &&
      a.directoryCtimeMs === b.directoryCtimeMs

/** 只比较索引的业务投影，补充本地校验信息不算资源内容变化。 */
const sameIndexEntry = (a: EagleItemIndex, b: EagleItemIndex) =>
  a.id === b.id &&
  a.name === b.name &&
  a.ext === b.ext &&
  a.size === b.size &&
  a.width === b.width &&
  a.height === b.height &&
  a.mtime === b.mtime &&
  a.lastModified === b.lastModified &&
  a.fileName === b.fileName &&
  a.thumbnailName === b.thumbnailName &&
  !!a.isDeleted === !!b.isDeleted &&
  a.folders.length === b.folders.length &&
  a.folders.every((id, i) => id === b.folders[i])

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

/**
 * 增量校验核心逻辑：
 * 1. 同步库根 metadata.json 的文件夹树；
 * 2. 尝试读取库根 mtime.json（Eagle 私有变更指纹）；
 * 3. readdir 枚举 images/ 目录以获取实际存在的所有 .info ID；
 * 4. 移除磁盘已消失的条目；
 * 5. 新增或 Eagle 指纹不一致时重读；指纹缺失时校验本地文件属性。
 * 6. 重读后比较实际投影与校验信息，仅标记真正需要保存的条目。
 */
export const scanIndex = async (
  libraryPath: string,
  previous: EagleIndexState | null,
  mtimeMap: Record<string, number> | null,
): Promise<{
  index: EagleIndexState
  changedIds: string[]
  cacheChangedIds: string[]
}> => {
  const startedAt = indexNow()
  const foldersStartedAt = indexNow()
  // 1. 文件夹树同步
  const rawLibrary = (await fs.readJson(
    path.join(libraryPath, 'metadata.json'),
  )) as { folders?: EagleRawFolder[] }
  const folders = rawLibrary.folders ?? []
  console.log(`[Eagle] 文件夹树读取：${indexElapsed(foldersStartedAt)}`)

  // 3. 保留目录枚举，检测新增与彻底删除，不仅依赖库根指纹。
  const directoriesStartedAt = indexNow()
  const dirNames = await fs.readdir(imagesDir(libraryPath))
  const diskIds = new Set(
    dirNames
      .filter((d) => d.endsWith('.info'))
      .map((d) => d.slice(0, -'.info'.length)),
  )
  console.log(
    `[Eagle] 条目目录枚举：${indexElapsed(directoriesStartedAt)}，${diskIds.size} 个目录`,
  )

  const index: EagleIndexState =
    previous?.libraryPath === libraryPath
      ? previous
      : { libraryPath, folders: [], items: new Map() }
  index.folders = folders
  const items = index.items

  // 4. 清理磁盘上已消失的条目
  const validationStartedAt = indexNow()
  const changedIds = new Set<string>()
  const cacheChangedIds = new Set<string>()
  let removedCount = 0
  for (const id of [...items.keys()]) {
    if (!diskIds.has(id)) {
      items.delete(id)
      changedIds.add(id)
      cacheChangedIds.add(id)
      removedCount++
    }
  }

  // 5. Eagle 指纹正常时保持原快速路径，缺失时使用 LinAI 本地校验信息。
  const toLoad: string[] = []
  const toValidate: string[] = []
  const fingerprints = new Map<string, EagleItemScanFingerprint>()
  let eagleReused = 0
  let localReused = 0
  for (const id of diskIds) {
    const cached = items.get(id)
    if (!cached) {
      toLoad.push(id)
    } else if (mtimeMap?.[id] === undefined) {
      if (cached.scanFingerprint) toValidate.push(id)
      else toLoad.push(id)
    } else if (mtimeMap[id] !== cached.lastModified) {
      toLoad.push(id)
    } else {
      eagleReused++
    }
  }
  await runPool(toValidate, SCAN_CONCURRENCY, async (id) => {
    const fingerprint = await readScanFingerprint(libraryPath, id)
    if (
      fingerprint &&
      sameScanFingerprint(fingerprint, items.get(id)?.scanFingerprint)
    ) {
      localReused++
    } else {
      if (fingerprint) fingerprints.set(id, fingerprint)
      toLoad.push(id)
    }
  })
  console.log(
    `[Eagle] 条目变更校验：${indexElapsed(validationStartedAt)}，Eagle 指纹复用 ${eagleReused}，本地属性校验 ${toValidate.length} / 复用 ${localReused}，待重读 ${toLoad.length}，目录移除 ${removedCount}`,
  )

  const reloadStartedAt = indexNow()
  if (toLoad.length > 0) {
    await runPool(toLoad, SCAN_CONCURRENCY, async (id) => {
      const cached = items.get(id)
      const before =
        fingerprints.get(id) ?? (await readScanFingerprint(libraryPath, id))
      const meta = await readItemMeta(libraryPath, id)
      const entry = meta ? await buildIndexEntry(libraryPath, meta) : null
      if (entry) {
        const after = await readScanFingerprint(libraryPath, id)
        // 外部 Eagle 不受本应用写锁约束，不缓存读取期间变化后的属性。
        if (before && after && sameScanFingerprint(before, after))
          entry.scanFingerprint = after
        const contentChanged = !cached || !sameIndexEntry(cached, entry)
        if (contentChanged) changedIds.add(id)
        if (
          contentChanged ||
          !sameScanFingerprint(cached?.scanFingerprint, entry.scanFingerprint)
        ) {
          items.set(id, entry)
          cacheChangedIds.add(id)
        }
      } else if (cached) {
        items.delete(id)
        changedIds.add(id)
        cacheChangedIds.add(id)
      }
    })
  }
  console.log(
    `[Eagle] 元数据与文件名重读：${indexElapsed(reloadStartedAt)}，读取 ${toLoad.length}，实际索引变化 ${changedIds.size}，待保存条目 ${cacheChangedIds.size}`,
  )
  console.log(
    `[Eagle] 索引扫描完成：${indexElapsed(startedAt)}，${items.size} 个条目`,
  )

  return {
    index,
    changedIds: [...changedIds],
    cacheChangedIds: [...cacheChangedIds],
  }
}
