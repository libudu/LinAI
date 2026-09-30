import { StorageError } from '@/server/common/storage/errors'
import { writeJsonFile } from '@/server/common/storage/json-file'
import fs from 'fs-extra'
import path from 'path'
import { readWritableItemMeta, withLibraryMutation } from './mutation'
import { imagesDir, ITEM_ID_PATTERN, sanitizeItemName } from './runtime'
import type {
  EagleItemIndex,
  EagleRawItemMeta,
  UpdateItemBatchEntry,
  UpdateItemPatch,
  UpdateItemResult,
} from './types'

interface RenamePlan {
  name: string
  fileName: string
  thumbnailName: string | null
  moves: Array<{ from: string; to: string }>
}

/** 先计算路径与同名序号，实际改名与元数据写入在同一错误恢复范围内执行。 */
const planRename = async (
  infoDir: string,
  entry: EagleItemIndex,
  meta: EagleRawItemMeta,
  name: string | undefined,
): Promise<RenamePlan | null> => {
  const requested =
    name === undefined ? meta.name : sanitizeItemName(name) || meta.name
  const plan: RenamePlan = {
    name: requested,
    fileName: entry.fileName,
    thumbnailName: entry.thumbnailName,
    moves: [],
  }
  if (requested === meta.name) return plan
  for (let suffix = 0; suffix <= 99; suffix++) {
    const candidate = suffix === 0 ? requested : `${requested} (${suffix})`
    const fileName = `${candidate}.${entry.ext}`
    if (
      fileName.toLowerCase() !== entry.fileName.toLowerCase() &&
      (await fs.pathExists(path.join(infoDir, fileName)))
    )
      continue
    plan.name = candidate
    // 原文件已缺失时仍可编辑元数据，不凭空创建文件。
    if (
      fileName !== entry.fileName &&
      (await fs.pathExists(path.join(infoDir, entry.fileName)))
    ) {
      plan.fileName = fileName
      plan.moves.push({
        from: path.join(infoDir, entry.fileName),
        to: path.join(infoDir, fileName),
      })
    }
    if (entry.thumbnailName) {
      const ext = path.extname(entry.thumbnailName)
      const base = path.basename(entry.thumbnailName, ext)
      const thumbnail = `${candidate}_thumbnail${ext}`
      if (
        base.toLowerCase() === `${meta.name}_thumbnail`.toLowerCase() &&
        thumbnail.toLowerCase() !== entry.thumbnailName.toLowerCase() &&
        !(await fs.pathExists(path.join(infoDir, thumbnail))) &&
        (await fs.pathExists(path.join(infoDir, entry.thumbnailName)))
      ) {
        plan.thumbnailName = thumbnail
        plan.moves.push({
          from: path.join(infoDir, entry.thumbnailName),
          to: path.join(infoDir, thumbnail),
        })
      }
    }
    return plan
  }
  return null
}

/** Windows 仅修改大小写时目标指向同一文件，直接 rename，避免 move 的目标存在检查。 */
const moveItemFile = async (from: string, to: string) => {
  if (from.toLowerCase() === to.toLowerCase()) await fs.rename(from, to)
  else await fs.move(from, to)
}

const writeRenamedItem = async (
  infoDir: string,
  plan: RenamePlan,
  meta: EagleRawItemMeta,
) => {
  const completed: RenamePlan['moves'] = []
  try {
    for (const move of plan.moves) {
      await moveItemFile(move.from, move.to)
      completed.push(move)
    }
    await writeJsonFile(path.join(infoDir, 'metadata.json'), meta, {
      backup: false,
    })
  } catch (error) {
    const rollbackErrors: unknown[] = []
    for (const move of completed.reverse()) {
      try {
        await moveItemFile(move.to, move.from)
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError)
      }
    }
    if (rollbackErrors.length > 0) {
      console.error('[Eagle] 条目改名回滚失败', error, rollbackErrors)
      throw new Error('条目写入失败且文件改名未能恢复，请刷新资源库后检查文件')
    }
    throw error
  }
}

/** 批量逐项反馈；单项失败不阻止其他条目写入，成功项统一同步缓存和事件。 */
export const updateItems = async (
  entries: UpdateItemBatchEntry[],
): Promise<UpdateItemResult[]> => {
  if (entries.length === 0) return []
  return withLibraryMutation<UpdateItemResult[]>(
    entries.map(({ id }) => ({
      id,
      ok: false,
      status: 409,
      reason: 'unavailable',
      error: 'Eagle 资源库当前不可用',
    })),
    async (index, changes) => {
      const results: UpdateItemResult[] = []
      for (const { id, patch } of entries) {
        try {
          const entry = ITEM_ID_PATTERN.test(id)
            ? index.items.get(id)
            : undefined
          if (!entry) {
            results.push({
              id,
              ok: false,
              status: 404,
              reason: 'not-found',
              error: 'Eagle 条目不存在',
            })
            continue
          }
          const meta = await readWritableItemMeta(index.libraryPath, id)
          if (!meta)
            throw new Error('Eagle 条目元数据不存在，请刷新资源库后检查')
          const infoDir = path.join(imagesDir(index.libraryPath), `${id}.info`)
          const plan = await planRename(infoDir, entry, meta, patch.name)
          if (!plan) {
            results.push({
              id,
              ok: false,
              status: 409,
              reason: 'rename-conflict',
              error: '同名文件冲突超过 99 个，请修改标题后重试',
            })
            continue
          }
          let mtime = meta.mtime
          try {
            mtime = Math.round(
              (await fs.stat(path.join(infoDir, entry.fileName))).mtimeMs,
            )
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
          }
          const isDeleted =
            patch.isDeleted ??
            (patch.folderIds === undefined && meta.isDeleted === true)
          const nextMeta: EagleRawItemMeta = {
            ...meta,
            name: plan.name,
            folders: patch.folderIds ?? meta.folders,
            isDeleted: isDeleted ? true : undefined,
            lastModified: changes.timestamp,
            mtime,
          }
          await writeRenamedItem(infoDir, plan, nextMeta)
          index.items.set(id, {
            ...entry,
            name: nextMeta.name,
            fileName: plan.fileName,
            thumbnailName: plan.thumbnailName,
            folders: nextMeta.folders ?? [],
            isDeleted,
            mtime,
            lastModified: changes.timestamp,
          })
          changes.updated.add(id)
          results.push({ id, ok: true })
        } catch (error) {
          console.error(`[Eagle] 更新条目失败：${id}`, error)
          results.push({
            id,
            ok: false,
            status: 500,
            reason: 'write-failed',
            error:
              error instanceof Error ? error.message : 'Eagle 条目写入失败',
          })
        }
      }
      return results
    },
  )
}

/** 单项调用沿用不存在返回 false，冲突和写盘错误交给全局错误处理。 */
export const updateItem = async (
  id: string,
  patch: UpdateItemPatch,
): Promise<boolean> => {
  const [result] = await updateItems([{ id, patch }])
  if (result.ok) return true
  if (result.reason === 'not-found') return false
  throw new StorageError(
    result.status === 409 ? 'REVISION_CONFLICT' : 'WRITE_FAILED',
    result.error,
  )
}
