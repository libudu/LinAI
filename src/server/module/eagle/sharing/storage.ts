import { dataPath } from '@/server/common/storage/data-path'
import {
  DocumentStore,
  type DocumentStoreOptions,
} from '@/server/common/storage/document-store'
import { StorageError } from '@/server/common/storage/errors'
import { readJsonFile, writeJsonFile } from '@/server/common/storage/json-file'
import { resourceLock } from '@/server/common/storage/resource-lock'
import type { StoredDocument } from '@/shared/storage/types'
import fs from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'

const fileNameSchema = z.enum([
  'identity.json',
  'member-history.json',
  'download-history.json',
])
const migrationSchema = z.object({
  version: z.literal(1),
  completed: z.array(fileNameSchema),
})
const migrationFile = dataPath('eagle', 'sharing', 'migration.json')

async function readMigrationJson<T>(file: string): Promise<T | undefined> {
  const value = await readJsonFile<T>(file, { preserveCorrupt: true })
  if (value !== undefined) return value
  let names: string[]
  try {
    names = await fs.readdir(path.dirname(file))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw new StorageError('READ_FAILED', '无法检查 Eagle 共享迁移文件', {
      file,
      cause: String(error),
    })
  }
  const name = path.basename(file)
  if (
    names.some(
      (entry) =>
        entry === `${name}.bak` || entry.startsWith(`${name}.corrupt-`),
    )
  )
    throw new StorageError(
      'CORRUPT',
      'Eagle 共享文件缺失但存在备份或损坏记录，请恢复后重试',
      { file },
    )
  return undefined
}

/** 共享数据只读写新目录；旧目录仅在首次迁移时作为只读来源。 */
export function createSharingDocumentStore<T>(
  fileName: z.infer<typeof fileNameSchema>,
  schema: z.ZodType<T>,
  options: Pick<DocumentStoreOptions<T>, 'maxValueLength'> = {},
) {
  const store = new DocumentStore<T>(
    dataPath('eagle', 'sharing', fileName),
    options,
  )
  const documentSchema = z.object({
    storageVersion: z.literal(1),
    revision: z.number().int().nonnegative(),
    updatedAt: z.number().nonnegative(),
    value: schema,
  })
  let ready: Promise<void> | undefined

  const readDocument = async (file: string) => {
    const document = await readMigrationJson<StoredDocument<T>>(file)
    if (document === undefined) return undefined
    if (!documentSchema.safeParse(document).success)
      throw new StorageError(
        'CORRUPT',
        'Eagle 共享数据格式不正确，迁移已停止并保留原文件',
        { file },
      )
    return document
  }

  const migrate = () => {
    ready ??= resourceLock
      .run('eagle.sharing-storage-migration', async () => {
        const raw = await readMigrationJson<unknown>(migrationFile)
        const parsed = migrationSchema.safeParse(
          raw === undefined ? { version: 1, completed: [] } : raw,
        )
        if (!parsed.success)
          throw new StorageError(
            'CORRUPT',
            'Eagle 共享数据迁移标记格式不正确，已保留原文件',
            { file: migrationFile },
          )
        const migration = parsed.data
        if (migration.completed.includes(fileName)) return

        // 新文件优先，绝不使用旧数据覆盖它；损坏也不能被当成文件缺失。
        const current = await readDocument(store.file)
        if (current === undefined) {
          const legacy = await readDocument(dataPath('interconnect', fileName))
          if (legacy !== undefined) {
            const maxValueLength = options.maxValueLength ?? 256 * 1024
            if (JSON.stringify(legacy.value).length > maxValueLength)
              throw new StorageError(
                'PAYLOAD_TOO_LARGE',
                'Eagle 共享数据超出大小限制，旧数据已保留',
                { maxValueLength },
              )
            // 保留完整信封、用户 ID、时间和修订；原文件继续作为迁移备份。
            await writeJsonFile(store.file, legacy, { backup: false })
          }
        }
        // 即使原来没有数据也记录完成，避免清空新数据后重新导入旧记录。
        migration.completed.push(fileName)
        await writeJsonFile(migrationFile, migration)
      })
      .catch((error) => {
        ready = undefined
        throw error
      })
    return ready
  }

  return {
    get: async () => {
      await migrate()
      return store.get()
    },
    replace: async (...args: Parameters<typeof store.replace>) => {
      await migrate()
      return store.replace(...args)
    },
  }
}
