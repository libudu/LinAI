import type { MediaDecisionStatus, MediaImageItem } from './types'

const MEDIA_CLASSIFIER_MARKS_STORAGE_KEY = 'media-classifier-local-marks'
const MARK_RETENTION_MS = 7 * 24 * 60 * 60 * 1000

export interface StoredMediaLocalMark {
  infoHash: string
  fileHash: string
  status: Exclude<MediaDecisionStatus, 'pending'>
  createdAt: number
}

type StoredMediaLocalMarkMap = Record<string, StoredMediaLocalMark>

const isStoredMediaLocalMark = (
  value: unknown,
): value is StoredMediaLocalMark => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<StoredMediaLocalMark>
  return (
    typeof candidate.infoHash === 'string' &&
    candidate.infoHash.length > 0 &&
    typeof candidate.fileHash === 'string' &&
    candidate.fileHash.length > 0 &&
    (candidate.status === 'keep' || candidate.status === 'delete') &&
    typeof candidate.createdAt === 'number' &&
    Number.isFinite(candidate.createdAt)
  )
}

const readStoredMediaLocalMarks = (): StoredMediaLocalMarkMap => {
  if (typeof window === 'undefined') {
    return {}
  }

  try {
    const rawValue = window.localStorage.getItem(
      MEDIA_CLASSIFIER_MARKS_STORAGE_KEY,
    )
    if (!rawValue) {
      return {}
    }

    const parsed = JSON.parse(rawValue) as Record<string, unknown>
    const normalizedMarks: StoredMediaLocalMarkMap = {}

    for (const [infoHash, record] of Object.entries(parsed)) {
      if (!isStoredMediaLocalMark(record)) {
        continue
      }

      normalizedMarks[infoHash] = record
    }

    return normalizedMarks
  } catch {
    return {}
  }
}

const writeStoredMediaLocalMarks = (marks: StoredMediaLocalMarkMap) => {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(
    MEDIA_CLASSIFIER_MARKS_STORAGE_KEY,
    JSON.stringify(marks),
  )
}

const buildMarkedImage = (
  image: MediaImageItem,
  mark?: StoredMediaLocalMark,
): MediaImageItem => ({
  ...image,
  status: mark?.status ?? 'pending',
  updatedAt: mark?.createdAt ?? null,
})

export const mergeMediaImagesWithLocalMarks = (images: MediaImageItem[]) => {
  const storedMarks = readStoredMediaLocalMarks()
  const now = Date.now()
  const imageByInfoHash = new Map(
    images.map((image) => [image.infoHash, image]),
  )
  const imagesByFileHash = new Map<string, MediaImageItem[]>()

  for (const image of images) {
    const matchedImages = imagesByFileHash.get(image.fileHash) ?? []
    matchedImages.push(image)
    imagesByFileHash.set(image.fileHash, matchedImages)
  }

  const nextMarks: StoredMediaLocalMarkMap = {}
  let changed = false

  for (const [storedInfoHash, record] of Object.entries(storedMarks)) {
    const directMatch = imageByInfoHash.get(record.infoHash)
    const fileHashMatches = imagesByFileHash.get(record.fileHash) ?? []
    const fallbackMatch =
      !directMatch && fileHashMatches.length === 1 ? fileHashMatches[0] : null
    const matchedImage = directMatch ?? fallbackMatch

    if (matchedImage) {
      const normalizedRecord: StoredMediaLocalMark = {
        ...record,
        infoHash: matchedImage.infoHash,
        fileHash: matchedImage.fileHash,
      }
      const existingRecord = nextMarks[matchedImage.infoHash]

      if (
        !existingRecord ||
        existingRecord.createdAt < normalizedRecord.createdAt
      ) {
        nextMarks[matchedImage.infoHash] = normalizedRecord
      }

      if (
        storedInfoHash !== normalizedRecord.infoHash ||
        record.infoHash !== normalizedRecord.infoHash ||
        record.fileHash !== normalizedRecord.fileHash
      ) {
        changed = true
      }
      continue
    }

    if (now - record.createdAt > MARK_RETENTION_MS) {
      changed = true
      continue
    }

    nextMarks[storedInfoHash] = record
  }

  if (
    changed ||
    Object.keys(nextMarks).length !== Object.keys(storedMarks).length
  ) {
    writeStoredMediaLocalMarks(nextMarks)
  }

  return images.map((image) =>
    buildMarkedImage(image, nextMarks[image.infoHash]),
  )
}

export const updateMediaLocalMark = (
  image: MediaImageItem,
  status: MediaDecisionStatus,
) => {
  const storedMarks = readStoredMediaLocalMarks()
  const createdAt = Date.now()

  if (status === 'pending') {
    if (storedMarks[image.infoHash]) {
      delete storedMarks[image.infoHash]
      writeStoredMediaLocalMarks(storedMarks)
    }
  } else {
    storedMarks[image.infoHash] = {
      infoHash: image.infoHash,
      fileHash: image.fileHash,
      status,
      createdAt,
    }
    writeStoredMediaLocalMarks(storedMarks)
  }

  return buildMarkedImage(
    image,
    status === 'pending'
      ? undefined
      : {
          infoHash: image.infoHash,
          fileHash: image.fileHash,
          status,
          createdAt,
        },
  )
}
