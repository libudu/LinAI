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

/** 只校验，不改写目录；按实际结构识别资源库，支持普通目录名原地初始化。 */
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
    if (entries.length === 0)
      throw new Error('所选文件夹尚未初始化为 Eagle 资源库')
    const images = await fs.lstat(path.join(resolved, 'images'))
    if (!images.isDirectory() || images.isSymbolicLink())
      throw new Error('资源库缺少 images 文件夹')
    const metadataPath = path.join(resolved, 'metadata.json')
    const metadata = await fs.lstat(metadataPath)
    if (!metadata.isFile() || metadata.isSymbolicLink())
      throw new Error('资源库缺少有效的 metadata.json 文件')
    if (!metadataSchema.safeParse(await fs.readJson(metadataPath)).success)
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
