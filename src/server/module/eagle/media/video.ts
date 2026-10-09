import { dataPath } from '@/server/common/storage/data-path'
import { resourceLock } from '@/server/common/storage/resource-lock'
import type { OrganizeVideoInfo } from '@/shared/eagle/organize'
import ffmpegPath from 'ffmpeg-static'
import ffprobe from 'ffprobe-static'
import fs from 'fs-extra'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'
import sharp from 'sharp'
import type { EagleItemMediaSource } from '../library'
import { getVideoContactSheetLayout } from './video-layout'

const CACHE_DIR = dataPath('eagle', 'video-contact-sheets')

/** 参数数组不经 shell，Windows 隐藏进程；清空任务时立即终止抽帧。 */
const runMediaCommand = (
  executable: string,
  args: string[],
  signal?: AbortSignal,
): Promise<Buffer> => {
  signal?.throwIfAborted()
  return new Promise((resolve, reject) => {
    execFile(
      executable,
      args,
      {
        encoding: 'buffer',
        windowsHide: true,
        signal,
        timeout: 60_000,
        maxBuffer: 16 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              `视频解码失败：${stderr.toString().trim().slice(-500) || error.message}`,
            ),
          )
        } else resolve(stdout)
      },
    )
  })
}

const readVideoDuration = async (filePath: string, signal?: AbortSignal) => {
  const buffer = await runMediaCommand(
    ffprobe.path,
    [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=duration:format=duration',
      '-of',
      'json',
      filePath,
    ],
    signal,
  )
  const info = JSON.parse(buffer.toString()) as {
    streams?: { duration?: string }[]
    format?: { duration?: string }
  }
  if (!info.streams?.length) throw new Error('文件没有可解码的视频画面')
  const streamDuration = Number(info.streams[0].duration)
  return Number.isFinite(streamDuration) && streamDuration > 0
    ? streamDuration
    : Number(info.format?.duration)
}

const createContactSheet = async (
  filePath: string,
  layout: ReturnType<typeof getVideoContactSheetLayout>,
  signal?: AbortSignal,
) => {
  if (!ffmpegPath) throw new Error('当前平台缺少视频解码器')
  const frames: Buffer[] = []
  // 输入前 seek，长视频无需从头解码；每次仅保留一张小图，不缓存原视频。
  for (let index = 0; index < layout.frameCount; index++) {
    const frame = await runMediaCommand(
      ffmpegPath,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostdin',
        '-threads',
        '1',
        '-ss',
        String(index * layout.interval),
        '-i',
        filePath,
        '-map',
        '0:v:0',
        '-an',
        '-sn',
        '-dn',
        '-vf',
        `scale=iw*sar:ih,setsar=1,scale=${layout.maxDimension}:${layout.maxDimension}:force_original_aspect_ratio=decrease`,
        '-frames:v',
        '1',
        '-threads',
        '1',
        '-f',
        'image2pipe',
        '-c:v',
        'png',
        'pipe:1',
      ],
      signal,
    )
    if (!frame.length)
      throw new Error(`视频 ${index * layout.interval} 秒处无法提取画面`)
    frames.push(frame)
  }
  signal?.throwIfAborted()
  const { width, height } = await sharp(frames[0]).metadata()
  if (!width || !height) throw new Error('无法读取视频画面尺寸')
  const { columns, rows, spacing, quality } = layout
  return sharp({
    create: {
      width: columns * width + (columns + 1) * spacing,
      height: rows * height + (rows + 1) * spacing,
      channels: 3,
      background: '#ffffff',
    },
  })
    .composite(
      frames.map((input, index) => ({
        input,
        left: spacing + (index % columns) * (width + spacing),
        top: spacing + Math.floor(index / columns) * (height + spacing),
      })),
    )
    .webp({ quality })
    .toBuffer()
}

/** 只写应用缓存；按源文件属性失效，AI 与手动确认读取同一份联系表。 */
export const getVideoContactSheet = async (
  source: EagleItemMediaSource,
  signal?: AbortSignal,
): Promise<{ buffer: Buffer; videoInfo: OrganizeVideoInfo }> => {
  const stat = await fs.stat(source.filePath)
  const key = createHash('sha256')
    .update(JSON.stringify(['v1', source.filePath, stat.size, stat.mtimeMs]))
    .digest('hex')
    .slice(0, 24)
  const cachePath = path.join(CACHE_DIR, `${source.id}-${key}.webp`)
  return resourceLock.run(`eagle.video:${source.id}`, async () => {
    signal?.throwIfAborted()
    const duration = await readVideoDuration(source.filePath, signal)
    const layout = getVideoContactSheetLayout(duration)
    const videoInfo: OrganizeVideoInfo = {
      duration,
      interval: layout.interval,
      frameCount: layout.frameCount,
      columns: layout.columns,
      rows: layout.rows,
    }
    if (await fs.pathExists(cachePath))
      return { buffer: await fs.readFile(cachePath), videoInfo }
    // 限制本地解码并发，不随视觉请求并发（最多 20）启动大量 FFmpeg。
    return resourceLock.run('eagle.video-decoder', async () => {
      signal?.throwIfAborted()
      const buffer = await createContactSheet(source.filePath, layout, signal)
      signal?.throwIfAborted()
      const current = await fs.stat(source.filePath)
      if (current.size !== stat.size || current.mtimeMs !== stat.mtimeMs)
        throw new Error('视频在抽帧期间发生变更，请重试')
      await fs.ensureDir(CACHE_DIR)
      const temporaryPath = `${cachePath}.${randomUUID()}.tmp`
      try {
        await fs.writeFile(temporaryPath, buffer, { flag: 'wx' })
        await fs.move(temporaryPath, cachePath, { overwrite: true })
      } finally {
        await fs.remove(temporaryPath)
      }
      return { buffer, videoInfo }
    })
  })
}
