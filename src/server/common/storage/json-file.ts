import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import { StorageError } from './errors'

/**
 * 可靠 JSON 文件读写：
 * - 写入：同目录唯一临时文件 + fsync + 备份 + rename 替换，进程中断不会留下半个 JSON
 * - 备份：替换前把最近一次有效文件复制为 <file>.bak
 * - 损坏：解析失败时把原文件改名为 <file>.corrupt-<时间戳> 并抛 StorageError(CORRUPT)，
 *   绝不把损坏文件当成空数据继续覆盖
 */

const tempFileOf = (file: string): string =>
  `${file}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`

const backupOf = (file: string): string => `${file}.bak`

const corruptFileOf = (file: string): string => `${file}.corrupt-${Date.now()}`

/** 把损坏文件改名为 .corrupt-<时间戳> 并返回对应的 StorageError(CORRUPT)，供调用方抛出或记录 */
export const toCorrupt = (file: string, error: unknown): StorageError => {
  try {
    fs.renameSync(file, corruptFileOf(file))
  } catch (renameError) {
    console.error(`[storage] 损坏文件改名失败: ${file}`, renameError)
  }
  return new StorageError(
    'CORRUPT',
    `JSON 文件损坏，已改名为 .corrupt 备份: ${path.basename(file)}`,
    { file, cause: String(error) },
  )
}

/** 读取 JSON；文件缺失返回 undefined；损坏抛 StorageError(CORRUPT)，其他 IO 错误抛 READ_FAILED */
export const readJsonFile = async <T>(file: string): Promise<T | undefined> => {
  let content: string
  try {
    content = await fsp.readFile(file, 'utf-8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw new StorageError('READ_FAILED', `读取文件失败: ${file}`, {
      file,
      cause: String(error),
    })
  }
  try {
    return JSON.parse(content) as T
  } catch (error) {
    throw toCorrupt(file, error)
  }
}

// Windows 上杀软/索引器可能瞬时持有目标文件句柄，导致 rename 替换偶发 EPERM/EBUSY，短退避重试
const RENAME_RETRIES = 5
const isRetriableRename = (error: unknown): boolean =>
  ['EPERM', 'EBUSY', 'EACCES'].includes(
    (error as NodeJS.ErrnoException)?.code ?? '',
  )
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** 原子写入 JSON；任何一步失败都抛 StorageError(WRITE_FAILED)，调用方必须感知 */
export const writeJsonFile = async (
  file: string,
  data: unknown,
): Promise<void> => {
  const tempFile = tempFileOf(file)
  try {
    await fsp.mkdir(path.dirname(file), { recursive: true })
    const handle = await fsp.open(tempFile, 'w')
    try {
      await handle.writeFile(JSON.stringify(data, null, 2), 'utf-8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    // 替换前保留最近一次有效备份，备份失败不阻塞主流程
    try {
      await fsp.copyFile(file, backupOf(file))
    } catch {
      /* 目标不存在或备份失败时忽略 */
    }
    for (let attempt = 1; ; attempt++) {
      try {
        await fsp.rename(tempFile, file)
        break
      } catch (error) {
        if (attempt >= RENAME_RETRIES || !isRetriableRename(error)) throw error
        await sleep(20 * attempt)
      }
    }
  } catch (error) {
    await fsp.rm(tempFile, { force: true }).catch(() => undefined)
    if (error instanceof StorageError) throw error
    throw new StorageError('WRITE_FAILED', `写入文件失败: ${file}`, {
      file,
      cause: String(error),
    })
  }
}
