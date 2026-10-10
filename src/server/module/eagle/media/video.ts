import { resourceLock } from '@/server/common/storage/resource-lock'
import type { OrganizeVideoInfo } from '@/shared/eagle/organize'
import ffmpegPath from 'ffmpeg-static'
import fs from 'fs-extra'
import { execFile } from 'node:child_process'
import sharp from 'sharp'
import {
  readVideoContactSheet,
  saveVideoContactSheet,
  type EagleItemMediaSource,
} from '../library'
import { getVideoContactSheetLayout } from './video-layout'
import { readVideoMetadata } from './video-metadata'

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

/** 联系表随视频长期保存在库内；按需读取，改名、分类和搬迁库不使其失效。 */
export const getVideoContactSheet = async (
  source: EagleItemMediaSource,
  signal?: AbortSignal,
): Promise<{ buffer: Buffer; videoInfo: OrganizeVideoInfo }> => {
  return resourceLock.run(
    `eagle.video:${source.libraryPath}:${source.id}`,
    async () => {
      signal?.throwIfAborted()
      const stat = await fs.stat(source.filePath)
      const stored = await readVideoContactSheet(source, stat)
      signal?.throwIfAborted()
      if (stored) return stored
      // 限制本地解码并发，不随视觉请求并发（最多 20）启动大量 FFmpeg。
      return resourceLock.run('eagle.video-decoder', async () => {
        signal?.throwIfAborted()
        const { duration } = await readVideoMetadata(source.filePath, signal)
        const layout = getVideoContactSheetLayout(duration)
        const videoInfo: OrganizeVideoInfo = {
          duration,
          interval: layout.interval,
          frameCount: layout.frameCount,
          columns: layout.columns,
          rows: layout.rows,
        }
        const buffer = await createContactSheet(source.filePath, layout, signal)
        signal?.throwIfAborted()
        await saveVideoContactSheet(source, stat, buffer, videoInfo, signal)
        return { buffer, videoInfo }
      })
    },
  )
}
