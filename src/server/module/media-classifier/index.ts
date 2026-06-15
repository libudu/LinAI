import { constants } from 'fs'
import fs from 'fs-extra'
import path from 'path'
import sharp from 'sharp'
import { buildThumbnailCacheKey, createMediaImageHasher } from './hash'

const MEDIA_CLASSIFIER_DATA_DIR = path.join(
  process.cwd(),
  'data',
  'media-classifier',
)
const MEDIA_CLASSIFIER_STATE_FILE = path.join(
  MEDIA_CLASSIFIER_DATA_DIR,
  'state.json',
)
const MEDIA_CLASSIFIER_THUMB_DIR = path.join(
  MEDIA_CLASSIFIER_DATA_DIR,
  'thumb-cache',
)
const THUMB_MAX_SIZE = 360

const IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.bmp',
  '.avif',
  '.tif',
  '.tiff',
])

export type MediaDecisionStatus = 'pending' | 'keep' | 'delete'
type MediaWorkspaceKind = 'source' | 'result'

interface MediaClassifierState {
  sourceDir: string
  resultDir: string
}

interface ScannedImageRecord {
  relativePath: string
  absolutePath: string
  name: string
  size: number
  mtimeMs: number
  infoHash: string
  fileHash: string
}

export interface MediaImageItem {
  relativePath: string
  name: string
  sourcePath: string
  resultPath: string | null
  size: number
  mtimeMs: number
  infoHash: string
  fileHash: string
  status: MediaDecisionStatus
  updatedAt: number | null
  previewUrl: string
  thumbUrl: string
}

export interface MediaImageListResult {
  items: MediaImageItem[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

export interface MediaWorkspaceSnapshot {
  sourceDir: string
  resultDir: string
  summary: {
    originalCount: number
    screenedCount: number
    trashCount: number
    classifiedCount: number
    pendingCount: number
  }
}

interface ImageBinaryResponse {
  file: Buffer
  contentType: string
}

fs.ensureDirSync(MEDIA_CLASSIFIER_DATA_DIR)
fs.ensureDirSync(MEDIA_CLASSIFIER_THUMB_DIR)

const createDefaultState = (): MediaClassifierState => ({
  sourceDir: '',
  resultDir: '',
})

const normalizeAbsolutePath = (inputPath: string) =>
  path.normalize(inputPath.trim())

const normalizeComparePath = (inputPath: string) =>
  path
    .resolve(inputPath)
    .replace(/[\\\/]+$/, '')
    .toLowerCase()

const isSupportedImageFile = (filename: string) =>
  IMAGE_EXTENSIONS.has(path.extname(filename).toLowerCase())

const getImageMimeType = (filename: string) => {
  const ext = path.extname(filename).slice(1).toLowerCase()
  if (ext === 'jpg') {
    return 'image/jpeg'
  }
  if (ext === 'tif') {
    return 'image/tiff'
  }
  return `image/${ext || 'jpeg'}`
}

const ensureSubPath = (baseDir: string, targetPath: string) => {
  const normalizedBaseDir = normalizeComparePath(baseDir)
  const resolvedTarget = path.resolve(targetPath)
  const comparableTarget = normalizeComparePath(resolvedTarget)
  const withSeparator = `${normalizedBaseDir}${path.sep}`

  if (
    comparableTarget !== normalizedBaseDir &&
    !comparableTarget.startsWith(withSeparator)
  ) {
    throw new Error('非法文件路径')
  }

  return resolvedTarget
}

const ensureRelativeSourcePath = (sourceDir: string, relativePath: string) => {
  const trimmedPath = relativePath.trim()
  if (!trimmedPath) {
    throw new Error('图片路径不能为空')
  }

  const resolvedPath = ensureSubPath(
    sourceDir,
    path.join(sourceDir, trimmedPath),
  )
  const normalizedRelativePath = path
    .relative(path.resolve(sourceDir), resolvedPath)
    .replace(/\\/g, '/')

  if (!normalizedRelativePath || normalizedRelativePath.startsWith('..')) {
    throw new Error('非法图片路径')
  }

  return {
    absolutePath: resolvedPath,
    relativePath: normalizedRelativePath,
  }
}

const resolveResultPath = (resultDir: string, relativePath: string) =>
  ensureSubPath(resultDir, path.join(resultDir, relativePath))

const buildImageUrl = (relativePath: string, thumb = false) =>
  `/api/media-classifier/image?relativePath=${encodeURIComponent(relativePath)}${
    thumb ? '&thumb=true' : ''
  }`

const readState = async (): Promise<MediaClassifierState> => {
  if (!(await fs.pathExists(MEDIA_CLASSIFIER_STATE_FILE))) {
    return createDefaultState()
  }

  const rawState = await fs.readJson(MEDIA_CLASSIFIER_STATE_FILE)
  return {
    sourceDir:
      typeof rawState?.sourceDir === 'string'
        ? normalizeAbsolutePath(rawState.sourceDir)
        : '',
    resultDir:
      typeof rawState?.resultDir === 'string'
        ? normalizeAbsolutePath(rawState.resultDir)
        : '',
  }
}

const writeState = async (state: MediaClassifierState) => {
  await fs.outputJson(MEDIA_CLASSIFIER_STATE_FILE, state, { spaces: 2 })
}

const hasDirectoryAccess = async (
  directoryPath: string,
  includeWrite: boolean,
) => {
  const normalizedPath = normalizeAbsolutePath(directoryPath)
  if (!normalizedPath || !path.isAbsolute(normalizedPath)) {
    return false
  }

  if (!(await fs.pathExists(normalizedPath))) {
    return false
  }

  const stat = await fs.stat(normalizedPath)
  if (!stat.isDirectory()) {
    return false
  }

  const mode = includeWrite ? constants.R_OK | constants.W_OK : constants.R_OK
  await fs.access(normalizedPath, mode)
  return true
}

const validateWorkspaceDirectory = async (
  directoryPath: string,
  kind: MediaWorkspaceKind,
) => {
  const normalizedPath = normalizeAbsolutePath(directoryPath)

  if (!normalizedPath) {
    throw new Error(
      kind === 'source' ? '请选择源图片文件夹' : '请选择结果文件夹',
    )
  }

  if (!path.isAbsolute(normalizedPath)) {
    throw new Error('请选择绝对路径')
  }

  if (!(await fs.pathExists(normalizedPath))) {
    throw new Error('目录不存在')
  }

  const stat = await fs.stat(normalizedPath)
  if (!stat.isDirectory()) {
    throw new Error('输入路径不是目录')
  }

  await fs.access(
    normalizedPath,
    kind === 'source' ? constants.R_OK : constants.R_OK | constants.W_OK,
  )

  return normalizedPath
}

const scanImageFiles = async (
  sourceDir: string,
): Promise<ScannedImageRecord[]> => {
  const records: ScannedImageRecord[] = []
  const imageHasher = await createMediaImageHasher()

  const walk = async (currentDir: string) => {
    const entries = await fs.readdir(currentDir, { withFileTypes: true })

    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        await walk(absolutePath)
        continue
      }

      if (!entry.isFile() || !isSupportedImageFile(entry.name)) {
        continue
      }

      const stat = await fs.stat(absolutePath)
      const { infoHash, fileHash } = await imageHasher.hashFile(
        absolutePath,
        stat.mtimeMs,
        stat.size,
      )

      records.push({
        relativePath: path
          .relative(sourceDir, absolutePath)
          .replace(/\\/g, '/'),
        absolutePath,
        name: path.basename(absolutePath),
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        infoHash,
        fileHash,
      })
    }
  }

  await walk(sourceDir)
  await imageHasher.persist()

  return records.sort((left, right) => {
    if (right.mtimeMs !== left.mtimeMs) {
      return right.mtimeMs - left.mtimeMs
    }

    return left.relativePath.localeCompare(right.relativePath, 'zh-CN')
  })
}

const loadStateAndImages = async () => {
  const state = await readState()

  if (!(await hasDirectoryAccess(state.sourceDir, false))) {
    return {
      state,
      images: [] as ScannedImageRecord[],
    }
  }

  const images = await scanImageFiles(state.sourceDir)
  return {
    state,
    images,
  }
}

const buildImageItem = (
  state: MediaClassifierState,
  image: ScannedImageRecord,
): MediaImageItem => ({
  relativePath: image.relativePath,
  name: image.name,
  sourcePath: image.absolutePath,
  resultPath: state.resultDir
    ? resolveResultPath(state.resultDir, image.relativePath)
    : null,
  size: image.size,
  mtimeMs: image.mtimeMs,
  infoHash: image.infoHash,
  fileHash: image.fileHash,
  status: 'pending',
  updatedAt: null,
  previewUrl: buildImageUrl(image.relativePath),
  thumbUrl: buildImageUrl(image.relativePath, true),
})

const buildWorkspaceSnapshot = (
  state: MediaClassifierState,
  images: ScannedImageRecord[],
): MediaWorkspaceSnapshot => {
  const originalCount = images.length

  return {
    sourceDir: state.sourceDir,
    resultDir: state.resultDir,
    summary: {
      originalCount,
      screenedCount: 0,
      trashCount: 0,
      classifiedCount: 0,
      pendingCount: originalCount,
    },
  }
}

const ensureWorkspaceReady = async (
  state: MediaClassifierState,
  requireResultDir = false,
) => {
  if (!(await hasDirectoryAccess(state.sourceDir, false))) {
    throw new Error('请先配置有效的源图片文件夹')
  }

  if (requireResultDir && !(await hasDirectoryAccess(state.resultDir, true))) {
    throw new Error('请先配置有效的结果文件夹')
  }
}

const ensureThumbnail = async (
  sourcePath: string,
  mtimeMs: number,
  size: number,
) => {
  const thumbPath = path.join(
    MEDIA_CLASSIFIER_THUMB_DIR,
    `${buildThumbnailCacheKey(sourcePath, mtimeMs, size)}.webp`,
  )

  if (!(await fs.pathExists(thumbPath))) {
    const thumbBuffer = await sharp(sourcePath)
      .resize(THUMB_MAX_SIZE, THUMB_MAX_SIZE, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 70 })
      .toBuffer()

    await fs.writeFile(thumbPath, thumbBuffer)
  }

  return await fs.readFile(thumbPath)
}

const removeResultFileIfExists = async (
  resultDir: string,
  relativePath: string,
) => {
  if (!resultDir) {
    return
  }

  const targetPath = resolveResultPath(resultDir, relativePath)
  if (await fs.pathExists(targetPath)) {
    await fs.remove(targetPath)
  }
}

export const getMediaWorkspaceSnapshot =
  async (): Promise<MediaWorkspaceSnapshot> => {
    const { state, images } = await loadStateAndImages()
    return buildWorkspaceSnapshot(state, images)
  }

export const setMediaWorkspace = async (
  sourceDir: string,
  resultDir: string,
) => {
  const nextSourceDir = await validateWorkspaceDirectory(sourceDir, 'source')
  const nextResultDir = await validateWorkspaceDirectory(resultDir, 'result')
  const nextState: MediaClassifierState = {
    sourceDir: nextSourceDir,
    resultDir: nextResultDir,
  }

  await writeState(nextState)
  const images = await scanImageFiles(nextSourceDir)
  return buildWorkspaceSnapshot(nextState, images)
}

export const getAllMediaImages = async () => {
  const { state, images } = await loadStateAndImages()
  return images.map((image) => buildImageItem(state, image))
}

export const deleteMediaImagePermanently = async (relativePath: string) => {
  const { state } = await loadStateAndImages()
  await ensureWorkspaceReady(state, false)
  const resolvedImagePath = ensureRelativeSourcePath(
    state.sourceDir,
    relativePath,
  )

  if (!(await fs.pathExists(resolvedImagePath.absolutePath))) {
    throw new Error('图片不存在')
  }

  await fs.remove(resolvedImagePath.absolutePath)
  await removeResultFileIfExists(
    state.resultDir,
    resolvedImagePath.relativePath,
  )
  return getMediaWorkspaceSnapshot()
}

export const readMediaImageBinary = async (
  relativePath: string,
  thumb = false,
): Promise<ImageBinaryResponse> => {
  const { state } = await loadStateAndImages()
  await ensureWorkspaceReady(state, false)
  const resolvedImagePath = ensureRelativeSourcePath(
    state.sourceDir,
    relativePath,
  )

  if (!(await fs.pathExists(resolvedImagePath.absolutePath))) {
    throw new Error('图片不存在')
  }

  const stat = await fs.stat(resolvedImagePath.absolutePath)

  if (thumb) {
    return {
      file: await ensureThumbnail(
        resolvedImagePath.absolutePath,
        stat.mtimeMs,
        stat.size,
      ),
      contentType: 'image/webp',
    }
  }

  return {
    file: await fs.readFile(resolvedImagePath.absolutePath),
    contentType: getImageMimeType(resolvedImagePath.absolutePath),
  }
}
