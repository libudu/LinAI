import fs from 'fs-extra'
import path from 'node:path'
import { z } from 'zod'
import { EagleError } from '../errors'

const folderSchema: z.ZodType = z.object({
  id: z.string().min(1),
  name: z.string(),
  children: z.lazy(() => z.array(folderSchema)).optional(),
})
const metadataSchema = z.object({ folders: z.array(folderSchema) })

/** 只校验，不创建或改写目录；空目录为后续下载预留。 */
export async function validateLibraryDirectory(
  input: string,
  allowEmpty = true,
) {
  if (!path.isAbsolute(input))
    throw new EagleError('INVALID_DIRECTORY', 400, '请选择本地绝对路径')
  try {
    const resolved = await fs.realpath(input)
    if (!(await fs.stat(resolved)).isDirectory())
      throw new Error('所选路径不是文件夹')
    const entries = await fs.readdir(resolved)
    if (allowEmpty && entries.length === 0)
      return { path: resolved, kind: 'empty' as const }
    if (!resolved.toLowerCase().endsWith('.library'))
      throw new Error('请选择空文件夹或已有的 .library 资源库')
    if (!(await fs.stat(path.join(resolved, 'images'))).isDirectory())
      throw new Error('资源库缺少 images 文件夹')
    if (
      !metadataSchema.safeParse(
        await fs.readJson(path.join(resolved, 'metadata.json')),
      ).success
    )
      throw new Error('资源库 metadata.json 格式不正确')
    return { path: resolved, kind: 'library' as const }
  } catch (error) {
    throw new EagleError(
      'INVALID_DIRECTORY',
      400,
      error instanceof Error
        ? `文件夹校验失败：${error.message}`
        : '文件夹校验失败',
    )
  }
}

export async function listDirectories(input?: string) {
  if (!input && process.platform === 'win32') {
    const drives = await Promise.all(
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(async (letter) => {
        const drive = `${letter}:\\`
        return (await fs.pathExists(drive))
          ? { name: drive, path: drive }
          : null
      }),
    )
    return {
      path: '',
      parent: '',
      directories: drives.filter((drive) => drive !== null),
    }
  }
  const resolved = await fs.realpath(input || path.parse(process.cwd()).root)
  const entries = await fs.readdir(resolved, { withFileTypes: true })
  return {
    path: resolved,
    parent: path.dirname(resolved) === resolved ? '' : path.dirname(resolved),
    directories: entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        name: entry.name,
        path: path.join(resolved, entry.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')),
  }
}
