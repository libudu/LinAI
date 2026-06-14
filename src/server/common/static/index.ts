import { exec } from 'child_process'
import crypto from 'crypto'
import fs from 'fs-extra'
import path from 'path'
import sharp from 'sharp'
import { templateManager } from '../template-manager'
import { GENERATED_IMAGES_API_PATH, INPUT_IMAGES_API_PATH } from './enum'

export const IMAGE_MAX_DIMENSION = 1600
export const IMAGE_COMPRESS_QUALITY = 60
export const THUMB_SIZE = 200
const THUMB_COMPRESS_QUALITY = 40

export const IMAGES_ROOT_DIR = path.join(process.cwd(), 'data', 'images')
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
    const metadata = await sharp(file).metadata()

    if (!metadata.width || !metadata.height) {
      return null
    }

    const width = metadata.width > metadata.height ? undefined : THUMB_SIZE
    const height = metadata.width > metadata.height ? THUMB_SIZE : undefined
    const thumbBuffer = await sharp(file)
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
  const webpBuffer = await sharp(buffer)
    .resize(IMAGE_MAX_DIMENSION, IMAGE_MAX_DIMENSION, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: IMAGE_COMPRESS_QUALITY })
    .toBuffer()

  const hash = crypto.createHash('md5').update(webpBuffer).digest('hex')
  const filename = `${hash}.webp`
  const filepath = path.join(INPUT_IMAGES_DIR, filename)

  if (!(await fs.pathExists(filepath))) {
    await fs.writeFile(filepath, webpBuffer)
  }

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

export async function clearUnreferencedInputImages() {
  const templates = await templateManager.getTemplates()
  const referencedImages = new Set<string>()

  for (const template of templates) {
    if (!template.images || !Array.isArray(template.images)) {
      continue
    }

    for (const imgUrl of template.images) {
      if (!imgUrl.startsWith(INPUT_IMAGES_API_PATH)) {
        continue
      }

      const filename = imgUrl.split('/').pop()
      if (filename) {
        referencedImages.add(filename)
      }
    }
  }

  const files = await fs.readdir(INPUT_IMAGES_DIR)
  let deletedCount = 0

  for (const file of files) {
    const filePath = path.join(INPUT_IMAGES_DIR, file)
    const stat = await fs.stat(filePath)

    if (!stat.isFile() || referencedImages.has(file)) {
      continue
    }

    await fs.remove(filePath)
    deletedCount++
  }

  return { deletedCount }
}

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
    })
  }

  return info
}

export async function listImages() {
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

  return [...generatedInfo, ...inputInfo].sort(
    (a, b) => b.createdAt - a.createdAt,
  )
}
