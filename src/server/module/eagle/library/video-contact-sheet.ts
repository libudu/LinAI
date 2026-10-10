import { StorageError } from '@/server/common/storage/errors'
import { writeJsonFile } from '@/server/common/storage/json-file'
import type { OrganizeVideoInfo } from '@/shared/eagle/organize'
import fs from 'fs-extra'
import { createHash, randomUUID } from 'node:crypto'
import { open } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { withLibraryMutation } from './mutation'
import { imagesDir, isVideoExt } from './runtime'
import type { EagleItemMediaSource } from './types'

const SCHEMA_VERSION = 1
/** 新生成联系表记录的规则版本；提高此值不会自动淘汰旧联系表。 */
const GENERATOR_VERSION = 2
/** 手动提高此值后，低于该版本的联系表在下次读取时重新生成。 */
const MIN_REUSABLE_GENERATOR_VERSION = 1

const contactSheetSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  generatorVersion: z.number().int().min(MIN_REUSABLE_GENERATOR_VERSION),
  source: z.object({
    size: z.number().int().nonnegative(),
    mtimeMs: z.number().finite(),
  }),
  video: z.object({ duration: z.number().finite().positive() }),
  sampling: z.object({
    interval: z.number().finite().positive(),
    frameCount: z.number().int().min(1).max(64),
    columns: z.number().int().min(1).max(8),
    rows: z.number().int().min(1).max(8),
  }),
  imageSha256: z.string().regex(/^[a-f0-9]{64}$/),
})

type VideoSourceFingerprint = z.infer<typeof contactSheetSchema>['source']

const sheetPaths = (source: EagleItemMediaSource) => {
  const directory = path.join(
    imagesDir(source.libraryPath),
    `${source.id}.info`,
    'linai',
  )
  return {
    directory,
    image: path.join(directory, 'video-contact-sheet.webp'),
    metadata: path.join(directory, 'video-contact-sheet.json'),
  }
}

const sameSource = (
  left: VideoSourceFingerprint,
  right: VideoSourceFingerprint,
) => left.size === right.size && left.mtimeMs === right.mtimeMs

const imageHash = (buffer: Buffer) =>
  createHash('sha256').update(buffer).digest('hex')

/** 仅分类或查看时读取；缺失、损坏或源视频变化时由媒体服务重新生成。 */
export const readVideoContactSheet = async (
  source: EagleItemMediaSource,
  fingerprint: VideoSourceFingerprint,
): Promise<{ buffer: Buffer; videoInfo: OrganizeVideoInfo } | null> => {
  const paths = sheetPaths(source)
  try {
    const parsed = contactSheetSchema.safeParse(
      await fs.readJson(paths.metadata),
    )
    if (!parsed.success || !sameSource(parsed.data.source, fingerprint))
      return null
    const metadata = parsed.data
    const buffer = await fs.readFile(paths.image)
    // 两个文件分步替换；校验内容，避免中断或文件损坏后复用不匹配的配对。
    if (imageHash(buffer) !== metadata.imageSha256) return null
    return {
      buffer,
      videoInfo: { duration: metadata.video.duration, ...metadata.sampling },
    }
  } catch (error) {
    if (
      error instanceof SyntaxError ||
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    )
      return null
    throw error
  }
}

/** 抽帧在锁外完成；提交时检查库、条目和源文件，避免删除后重建 .info 目录。 */
export const saveVideoContactSheet = async (
  source: EagleItemMediaSource,
  fingerprint: VideoSourceFingerprint,
  buffer: Buffer,
  videoInfo: OrganizeVideoInfo,
  signal?: AbortSignal,
): Promise<void> => {
  const saved = await withLibraryMutation(false, async (index) => {
    signal?.throwIfAborted()
    if (index.libraryPath !== source.libraryPath)
      throw new StorageError('REVISION_CONFLICT', 'Eagle 资源库已切换，请重试')
    const entry = index.items.get(source.id)
    if (!entry || !isVideoExt(entry.ext))
      throw new Error('视频已不存在，无法保存联系表')
    // 改名不改变 .info 目录；以当前索引中的原文件检查内容是否仍一致。
    const current = await fs.stat(
      path.join(
        imagesDir(index.libraryPath),
        `${source.id}.info`,
        entry.fileName,
      ),
    )
    if (!sameSource(current, fingerprint))
      throw new Error('视频在抽帧期间发生变更，请重试')
    const paths = sheetPaths(source)
    await fs.ensureDir(paths.directory)
    const temporaryPath = `${paths.image}.${randomUUID()}.tmp`
    const { duration, ...sampling } = videoInfo
    try {
      const handle = await open(temporaryPath, 'wx')
      try {
        await handle.writeFile(buffer)
        await handle.sync()
      } finally {
        await handle.close()
      }
      signal?.throwIfAborted()
      await fs.rename(temporaryPath, paths.image)
      await writeJsonFile(
        paths.metadata,
        {
          schemaVersion: SCHEMA_VERSION,
          generatorVersion: GENERATOR_VERSION,
          source: { size: fingerprint.size, mtimeMs: fingerprint.mtimeMs },
          video: { duration },
          sampling,
          imageSha256: imageHash(buffer),
        } satisfies z.infer<typeof contactSheetSchema>,
        { backup: false },
      )
    } finally {
      await fs.remove(temporaryPath)
    }
    // 旁文件不改变 Eagle 元数据、索引或修改指纹，无需发布库内容变更。
    return true
  })
  if (!saved)
    throw new StorageError('REVISION_CONFLICT', 'Eagle 资源库当前不可用')
}
