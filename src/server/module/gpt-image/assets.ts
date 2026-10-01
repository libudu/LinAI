import fs from 'fs-extra'
import path from 'path'
import {
  deleteImageFile,
  getImageDirectory,
  getImageFilesSnapshot,
  listImageFiles,
  type ImageDirectoryType,
} from '../../common/static'
import {
  publishImageAssetsChange,
  withImageLifecycle,
} from '../../common/static/image-lifecycle'
import { getImageReferences, imageFilename } from './image-references'

interface DeleteUnreferencedImagesOptions {
  type: ImageDirectoryType
  urls?: string[]
}

// 引用检查与文件操作在同一生命周期锁中完成，基础文件层不依赖业务资源。
async function deleteUnreferencedImagesLocked(
  options: DeleteUnreferencedImagesOptions,
) {
  const { type, urls } = options
  const referencedImages = (await getImageReferences())[type]
  const targetDir = getImageDirectory(type)
  const targetFilenames = new Set<string>()

  if (Array.isArray(urls) && urls.length > 0) {
    for (const url of urls) {
      const filename = imageFilename(type, url)
      if (filename) {
        targetFilenames.add(filename)
      }
    }
  } else {
    const files = await fs.readdir(targetDir)

    for (const file of files) {
      const filePath = path.join(targetDir, file)
      const stat = await fs.stat(filePath)
      if (stat.isFile()) {
        targetFilenames.add(file)
      }
    }
  }

  let deletedCount = 0
  let skippedCount = 0

  for (const filename of targetFilenames) {
    if (referencedImages.has(filename)) {
      skippedCount++
      continue
    }

    await deleteImageFile(type, filename)
    deletedCount++
  }

  if (deletedCount) publishImageAssetsChange()
  return { deletedCount, skippedCount }
}

export const deleteUnreferencedImages = (
  options: DeleteUnreferencedImagesOptions,
) => withImageLifecycle(() => deleteUnreferencedImagesLocked(options))

export const listImages = async () => {
  // 文件扫描不占生命周期锁；进入锁后取当前索引，覆盖扫描后发生的内部写删。
  await listImageFiles()
  return withImageLifecycle(async () => {
    const files = getImageFilesSnapshot()
    const references = await getImageReferences()
    return files.map((image) => ({
      ...image,
      isReferenced: references[image.type].has(
        imageFilename(image.type, image.url) || '',
      ),
    }))
  })
}
