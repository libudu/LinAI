import type { StoredDocument } from '@/shared/storage/types'
import fs from 'fs-extra'
import path from 'node:path'
import { dataPath } from '../../../common/storage/data-path'
import { StorageError } from '../../../common/storage/errors'
import { readJsonFile, writeJsonFile } from '../../../common/storage/json-file'
import { normalizeOrganizeTask, type StoredOrganizeTask } from './model'

let migration: Promise<void> | undefined

/** 迁移只读源文档，解析失败时保留原文件，重启后仍须明确报错，不能按无任务处理。 */
const readTaskDocument = async (file: string) => {
  const document = await readJsonFile<StoredDocument<StoredOrganizeTask>>(
    file,
    { preserveCorrupt: true },
  )
  if (document === undefined) return undefined
  if (
    !document ||
    typeof document.storageVersion !== 'number' ||
    !Number.isFinite(document.revision) ||
    !Number.isFinite(document.updatedAt) ||
    !document.value ||
    typeof document.value !== 'object'
  )
    throw new StorageError('CORRUPT', '无法识别的整理任务文档，原文件已保留', {
      file,
    })

  const task = normalizeOrganizeTask(document.value)
  if (
    (task.mediaType !== 'image' && task.mediaType !== 'video') ||
    typeof task.taskId !== 'string' ||
    !task.taskId ||
    !Number.isFinite(task.createdAt) ||
    !Array.isArray(task.itemIds) ||
    !task.itemIds.every((id) => typeof id === 'string') ||
    !Array.isArray(task.standards)
  )
    throw new StorageError('CORRUPT', '整理任务结构不合法，原文件已保留', {
      file,
    })
  return { ...document, value: task }
}

/**
 * 旧单任务按 mediaType 迁入独立目录，缺省为图片。
 * 先复制结果和任务到暂存目录，再原子改名提交；完成标记落盘前不开放任何任务操作。
 * 原 task.json / items 保留为迁移备份，完成标记防止清空新任务后重新导入旧数据。
 */
export const migrateLegacyOrganizeTask = (): Promise<void> => {
  migration ??= (async () => {
    const directory = dataPath('eagle', 'organize')
    const marker = path.join(directory, 'migration.json')
    const state = await readJsonFile<{ completed: boolean }>(marker, {
      preserveCorrupt: true,
    })
    if (state !== undefined) {
      if (!state || typeof state.completed !== 'boolean')
        throw new StorageError('CORRUPT', '整理迁移标记损坏，已保留原文件', {
          file: marker,
        })
      if (state.completed) return
    }

    const legacy = await readTaskDocument(path.join(directory, 'task.json'))
    if (legacy) {
      const task = legacy.value
      const target = path.join(directory, task.mediaType)
      if (await fs.pathExists(target)) {
        // 只为完全相同的源版本补写标记；旧版继续修改过任务时保留两份数据并报冲突。
        const existing = await readTaskDocument(path.join(target, 'task.json'))
        if (
          existing?.value.taskId !== task.taskId ||
          existing.value.mediaType !== task.mediaType ||
          existing.revision !== legacy.revision ||
          existing.updatedAt !== legacy.updatedAt
        )
          throw new StorageError(
            'REVISION_CONFLICT',
            '整理任务迁移目标已存在，旧数据已保留',
          )
      } else {
        // 每次重新复制到全新目录。旧版本可能在失败后更换了任务，不能复用残留结果。
        const staging = await fs.mkdtemp(
          path.join(directory, 'legacy-migration-'),
        )
        const items = path.join(directory, 'items')
        if (await fs.pathExists(items))
          await fs.copy(items, path.join(staging, 'items'))
        await writeJsonFile(path.join(staging, 'task.json'), {
          ...legacy,
          value: task,
        })
        await fs.rename(staging, target)
      }
    }
    await writeJsonFile(marker, { completed: true })
  })()
  return migration
}
