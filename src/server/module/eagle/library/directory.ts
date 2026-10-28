import fs from 'fs-extra'
import { open } from 'node:fs/promises'
import path from 'node:path'
import { EagleError } from '../errors'
import { getDefaultLibraryPath } from '../library-path'
import { validateLibraryDirectory } from '../sharing/paths'
import { withLibraryLock } from './runtime'

/** 保存设置时才初始化；锁内重新校验，排他创建，绝不覆盖已有内容。 */
export async function prepareLibraryDirectory(input: string) {
  const defaultPath = getDefaultLibraryPath()
  const isDefault =
    path.isAbsolute(input) && path.relative(defaultPath, input) === ''
  const createDefault = isDefault && !(await fs.pathExists(input))
  // 默认目录可以尚不存在；先解析父目录，确保初始化与其他库写操作使用同一锁键。
  const selectedPath = createDefault
    ? path.join(
        await fs.realpath(path.dirname(defaultPath)),
        path.basename(defaultPath),
      )
    : (await validateLibraryDirectory(input)).path
  return withLibraryLock(selectedPath, async () => {
    let createdRoot = false
    if (createDefault) {
      try {
        await fs.mkdir(selectedPath)
        createdRoot = true
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST')
          throw new EagleError(
            'LIBRARY_INITIALIZATION_FAILED',
            500,
            `创建默认资源库文件夹失败：${error instanceof Error ? error.message : '写入失败'}`,
          )
      }
    }
    const directory = await validateLibraryDirectory(selectedPath)
    if (directory.kind === 'library') return directory.path

    const imagesPath = path.join(directory.path, 'images')
    const createdFiles: string[] = []
    let createdImages = false
    const createJson = async (name: string, value: unknown) => {
      const filePath = path.join(directory.path, name)
      const handle = await open(filePath, 'wx')
      createdFiles.push(filePath)
      try {
        await handle.writeFile(JSON.stringify(value), 'utf8')
        await handle.sync()
      } finally {
        await handle.close()
      }
    }
    try {
      await fs.mkdir(imagesPath)
      createdImages = true
      if ((await fs.readdir(directory.path)).some((name) => name !== 'images'))
        throw new Error('所选文件夹内容已变化，请重新选择')
      await createJson('mtime.json', {})
      // 最后发布根元数据，避免未完成的目录被识别为有效库。
      await createJson('metadata.json', {
        folders: [],
        smartFolders: [],
        quickAccess: [],
        tagsGroups: [],
        modificationTime: Date.now(),
      })
      await validateLibraryDirectory(directory.path, false)
      return directory.path
    } catch (error) {
      // 只清理本次创建的文件和空目录，不递归删除可能由外部写入的内容。
      const cleanup = await Promise.allSettled([
        ...createdFiles.map((file) => fs.unlink(file)),
        ...(createdImages ? [fs.rmdir(imagesPath)] : []),
      ])
      let cleanupFailed = cleanup.some((result) => result.status === 'rejected')
      if (createdRoot) {
        try {
          await fs.rmdir(selectedPath)
        } catch {
          cleanupFailed = true
        }
      }
      throw new EagleError(
        'LIBRARY_INITIALIZATION_FAILED',
        500,
        `初始化 Eagle 资源库失败：${error instanceof Error ? error.message : '写入失败'}${cleanupFailed ? '；部分初始化文件未能清理，请检查所选目录' : ''}`,
      )
    }
  })
}
