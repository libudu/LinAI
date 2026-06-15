import crypto from 'crypto'
import fs from 'fs-extra'
import path from 'path'

const MEDIA_CLASSIFIER_DATA_DIR = path.join(
  process.cwd(),
  'data',
  'media-classifier',
)
const MEDIA_CLASSIFIER_HASH_CACHE_FILE = path.join(
  MEDIA_CLASSIFIER_DATA_DIR,
  'hash-cache.json',
)

interface MediaHashCache {
  fileHashes: Record<string, string>
}

export interface MediaImageHashResult {
  infoHash: string
  fileHash: string
}

export interface MediaImageHasher {
  hashFile: (
    absolutePath: string,
    mtimeMs: number,
    size: number,
  ) => Promise<MediaImageHashResult>
  persist: () => Promise<void>
}

fs.ensureDirSync(MEDIA_CLASSIFIER_DATA_DIR)

const createDefaultHashCache = (): MediaHashCache => ({
  fileHashes: {},
})

const readHashCache = async (): Promise<MediaHashCache> => {
  if (!(await fs.pathExists(MEDIA_CLASSIFIER_HASH_CACHE_FILE))) {
    return createDefaultHashCache()
  }

  const rawHashCache = await fs.readJson(MEDIA_CLASSIFIER_HASH_CACHE_FILE)
  return {
    fileHashes:
      rawHashCache?.fileHashes && typeof rawHashCache.fileHashes === 'object'
        ? rawHashCache.fileHashes
        : {},
  }
}

const writeHashCache = async (hashCache: MediaHashCache) => {
  await fs.outputJson(MEDIA_CLASSIFIER_HASH_CACHE_FILE, hashCache, {
    spaces: 2,
  })
}

export const buildImageInfoHash = (
  absolutePath: string,
  mtimeMs: number,
  size: number,
) =>
  crypto
    .createHash('md5')
    .update(`${path.resolve(absolutePath)}:${mtimeMs}:${size}`)
    .digest('hex')

const buildImageFileHash = async (absolutePath: string) =>
  await new Promise<string>((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(absolutePath)

    stream.on('data', (chunk) => {
      hash.update(chunk)
    })
    stream.on('error', reject)
    stream.on('end', () => {
      resolve(hash.digest('hex'))
    })
  })

export const buildThumbnailCacheKey = (
  sourcePath: string,
  mtimeMs: number,
  size: number,
) =>
  crypto
    .createHash('md5')
    .update(`${sourcePath}:${mtimeMs}:${size}`)
    .digest('hex')

export const createMediaImageHasher = async (): Promise<MediaImageHasher> => {
  const hashCache = await readHashCache()
  let hashCacheChanged = false

  return {
    hashFile: async (absolutePath, mtimeMs, size) => {
      const infoHash = buildImageInfoHash(absolutePath, mtimeMs, size)
      let fileHash = hashCache.fileHashes[infoHash]

      if (!fileHash) {
        fileHash = await buildImageFileHash(absolutePath)
        hashCache.fileHashes[infoHash] = fileHash
        hashCacheChanged = true
      }

      return {
        infoHash,
        fileHash,
      }
    },
    persist: async () => {
      if (hashCacheChanged) {
        await writeHashCache(hashCache)
      }
    },
  }
}
