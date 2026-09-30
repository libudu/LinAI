/** 条目元数据投影与增量扫描；生命周期与分片保存由调用方协调。 */
import fs from 'fs-extra'
import path from 'path'
import { runPool } from '../concurrency'
import { imagesDir, SCAN_CONCURRENCY } from './runtime'
import type {
  EagleIndexState,
  EagleItemIndex,
  EagleRawFolder,
  EagleRawItemMeta,
} from './types'

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
 * 5. 筛选出新目录或 lastModified 不一致的条目，并发加载并更新索引。
 */
export const scanIndex = async (
  libraryPath: string,
  previous: EagleIndexState | null,
  mtimeMap: Record<string, number> | null,
): Promise<{ index: EagleIndexState; changedIds: string[] }> => {
  // 1. 文件夹树同步
  const rawLibrary = (await fs.readJson(
    path.join(libraryPath, 'metadata.json'),
  )) as { folders?: EagleRawFolder[] }
  const folders = rawLibrary.folders ?? []

  // 3. 目录枚举（2 万个目录名在 OS 层面仅需几十毫秒）
  const dirNames = await fs.readdir(imagesDir(libraryPath))
  const diskIds = new Set(
    dirNames
      .filter((d) => d.endsWith('.info'))
      .map((d) => d.slice(0, -'.info'.length)),
  )

  const index: EagleIndexState =
    previous?.libraryPath === libraryPath
      ? previous
      : { libraryPath, folders: [], items: new Map() }
  index.folders = folders
  const items = index.items

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
    } else if (
      !mtimeMap ||
      mtimeMap[id] === undefined ||
      mtimeMap[id] !== cached.lastModified
    ) {
      // 指纹缺失时重读元数据，手动刷新不能继续信任旧缓存。
      toLoad.push(id)
    }
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
      else items.delete(id)
    })
  }

  return { index, changedIds: [...toLoad, ...removedIds] }
}
