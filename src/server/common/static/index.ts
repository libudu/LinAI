import { exec } from 'child_process'
import crypto from 'crypto'
import fs from 'fs-extra'
import path from 'path'
import sharp from 'sharp'
import {
  getImageReferences,
  imageFilename,
} from '../../module/gpt-image/image-references'
import { dataPath } from '../storage/data-path'
// 注册通用存储资源（副作用）
import '../storage/resources'
import { GENERATED_IMAGES_API_PATH, INPUT_IMAGES_API_PATH } from './enum'
import { publishImageAssetsChange, withImageLifecycle } from './image-lifecycle'

export const IMAGE_MAX_DIMENSION = 2000
export const IMAGE_COMPRESS_QUALITY = 85
export const THUMB_SIZE = 200
const THUMB_COMPRESS_QUALITY = 40

export const IMAGES_ROOT_DIR = dataPath('images')
export const GENERATED_IMAGES_DIR = path.join(IMAGES_ROOT_DIR, 'generated')
export const INPUT_IMAGES_DIR = path.join(IMAGES_ROOT_DIR, 'input')
export const THUMB_IMAGES_DIR = path.join(IMAGES_ROOT_DIR, 'thumb')

export type ImageDirectoryType = 'generated' | 'input'

interface ServeImageOptions {
  type: ImageDirectoryType
  filename: string
  thumb?: boolean
}

interface ImageResponseData {
  file: Buffer
  contentType: string
}

interface ListedImageInfo {
  url: string
  type: ImageDirectoryType
  createdAt: number
  isReferenced: boolean
}

interface DeleteUnreferencedImagesOptions {
  type: ImageDirectoryType
  urls?: string[]
}

fs.ensureDirSync(GENERATED_IMAGES_DIR)
fs.ensureDirSync(INPUT_IMAGES_DIR)
fs.ensureDirSync(THUMB_IMAGES_DIR)

function getImageDirectory(type: ImageDirectoryType) {
  return type === 'generated' ? GENERATED_IMAGES_DIR : INPUT_IMAGES_DIR
}

function getThumbnailPath(type: ImageDirectoryType, filename: string) {
  return path.join(THUMB_IMAGES_DIR, type, `${path.parse(filename).name}.webp`)
}

function getImageMimeType(filename: string) {
  const ext = path.extname(filename).slice(1).toLowerCase()
  if (ext === 'jpg') {
    return 'image/jpeg'
  }
  if (ext === 'webp') {
    return 'image/webp'
  }
  return `image/${ext}`
}

async function ensureThumbnail(
  sourcePath: string,
  thumbPath: string,
): Promise<Buffer | null> {
  await fs.ensureDir(path.dirname(thumbPath))

  if (!(await fs.pathExists(thumbPath))) {
    const file = await fs.readFile(sourcePath)
    const metadata = await sharp(file, { failOn: 'none' }).metadata()

    if (!metadata.width || !metadata.height) {
      return null
    }

    const width = metadata.width > metadata.height ? undefined : THUMB_SIZE
    const height = metadata.width > metadata.height ? THUMB_SIZE : undefined
    const thumbBuffer = await sharp(file, { failOn: 'none' })
      .resize(width, height)
      .webp({
        quality: THUMB_COMPRESS_QUALITY,
      })
      .toBuffer()
    await fs.writeFile(thumbPath, thumbBuffer)
  }

  if (!(await fs.pathExists(thumbPath))) {
    return null
  }

  return await fs.readFile(thumbPath)
}

export async function uploadInputImage(image: string) {
  if (!image.startsWith('data:image')) {
    throw new Error('Invalid image format')
  }

  const matches = image.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/)
  if (!matches) {
    throw new Error('Invalid base64 image data')
  }

  const buffer = Buffer.from(matches[2], 'base64')
  return importInputImage(buffer)
}

/** 将已有的本地图片转为输入图库图片，复用上传时的压缩与去重规则。 */
export async function importInputImage(buffer: Buffer) {
  const webpBuffer = await sharp(buffer, { failOn: 'none' })
    .resize(IMAGE_MAX_DIMENSION, IMAGE_MAX_DIMENSION, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: IMAGE_COMPRESS_QUALITY })
    .toBuffer()

  const hash = crypto.createHash('md5').update(webpBuffer).digest('hex')
  const filename = `${hash}.webp`
  const filepath = path.join(INPUT_IMAGES_DIR, filename)

  await withImageLifecycle(async () => {
    if (!(await fs.pathExists(filepath))) {
      await fs.writeFile(filepath, webpBuffer)
      publishImageAssetsChange()
    }
  })

  return {
    url: `${INPUT_IMAGES_API_PATH}/${filename}`,
  }
}

export async function serveImage(
  options: ServeImageOptions,
): Promise<ImageResponseData | null> {
  const { filename, thumb = false, type } = options
  const sourceDir = getImageDirectory(type)
  const sourcePath = path.join(sourceDir, filename)

  if (!(await fs.pathExists(sourcePath))) {
    return null
  }

  if (thumb) {
    const thumbPath = getThumbnailPath(type, filename)
    const thumbFile = await ensureThumbnail(sourcePath, thumbPath)
    if (thumbFile) {
      return {
        file: thumbFile,
        contentType: 'image/webp',
      }
    }
  }

  return {
    file: await fs.readFile(sourcePath),
    contentType: getImageMimeType(filename),
  }
}

export function openImageDirectory(type: ImageDirectoryType) {
  const targetDir = getImageDirectory(type)
  const command =
    process.platform === 'win32'
      ? `start "" "${targetDir}"`
      : process.platform === 'darwin'
        ? `open "${targetDir}"`
        : `xdg-open "${targetDir}"`

  exec(command)
}

async function deleteImageFile(type: ImageDirectoryType, filename: string) {
  const filePath = path.join(getImageDirectory(type), filename)
  const thumbPath = getThumbnailPath(type, filename)

  if (await fs.pathExists(filePath)) {
    await fs.remove(filePath)
  }

  if (await fs.pathExists(thumbPath)) {
    await fs.remove(thumbPath)
  }
}

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

async function getFilesInfo(
  dir: string,
  apiPath: string,
  type: ImageDirectoryType,
): Promise<ListedImageInfo[]> {
  if (!(await fs.pathExists(dir))) {
    return []
  }

  const files = await fs.readdir(dir)
  const info: ListedImageInfo[] = []

  for (const file of files) {
    const filepath = path.join(dir, file)
    const stat = await fs.stat(filepath)

    if (!stat.isFile()) {
      continue
    }

    info.push({
      url: `${apiPath}/${file}`,
      type,
      createdAt: stat.mtimeMs,
      isReferenced: false,
    })
  }

  return info
}

async function listImagesLocked() {
  const generatedInfo = await getFilesInfo(
    GENERATED_IMAGES_DIR,
    GENERATED_IMAGES_API_PATH,
    'generated',
  )
  const inputInfo = await getFilesInfo(
    INPUT_IMAGES_DIR,
    INPUT_IMAGES_API_PATH,
    'input',
  )

  const references = await getImageReferences()
  return [...generatedInfo, ...inputInfo]
    .map((image) => ({
      ...image,
      isReferenced: references[image.type].has(
        imageFilename(image.type, image.url) || '',
      ),
    }))
    .sort((a, b) => b.createdAt - a.createdAt)
}

export const listImages = () => withImageLifecycle(listImagesLocked)
