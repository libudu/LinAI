import type { EagleMediaEditSaveProgress } from '@/shared/eagle/media-edit'
import ffmpegPath from 'ffmpeg-static'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import sharp from 'sharp'
import type { EagleMediaEditOperation } from '../schemas'
import { encodeStaticHeif } from './heic'
import { preserveMediaTimestamps } from './timestamps'
import { readVideoMetadata } from './video-metadata'

export interface MediaEditProcessingOptions {
  signal?: AbortSignal
  onProgress?: (progress: EagleMediaEditSaveProgress) => void
}

/** 流式读取进度，不累计长视频日志；取消后等待进程关闭再清理输出。 */
const run = (
  executable: string,
  args: string[],
  timeout = 60_000,
  signal?: AbortSignal,
  onLine?: (line: string) => void,
) => {
  signal?.throwIfAborted()
  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true })
    const buffers: Buffer[] = []
    let length = 0
    let pending = ''
    let diagnostics = ''
    let failure: Error | undefined
    const abort = () => child.kill()
    signal?.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(() => {
      failure = new Error('媒体编辑处理超时')
      child.kill()
    }, timeout)
    timer.unref()
    child.on('error', (error) => {
      failure = error
    })
    child.stdout.on('data', (chunk: Buffer) => {
      if (onLine) {
        pending += chunk.toString()
        const lines = pending.split(/\r?\n/)
        pending = lines.pop() ?? ''
        for (const line of lines) onLine(line)
      } else {
        length += chunk.length
        if (length > 2 * 1024 * 1024) {
          failure = new Error('媒体编辑输出超出限制')
          child.kill()
        } else buffers.push(chunk)
      }
    })
    child.stderr.on('data', (chunk: Buffer) => {
      diagnostics = (diagnostics + chunk.toString()).slice(-2000)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      if (signal?.aborted) reject(signal.reason)
      else if (failure || code !== 0)
        reject(
          new Error(
            `媒体编辑处理失败：${failure?.message || diagnostics.trim().slice(-500) || `退出码 ${code}`}`,
          ),
        )
      else resolve(Buffer.concat(buffers))
    })
  })
}

export const editedMediaExtension = (ext: string, video: boolean) => {
  if (video) return 'mp4'
  const normalized = ext.toLowerCase()
  if (
    ['jpg', 'jpeg', 'png', 'webp', 'avif', 'tif', 'tiff', 'gif'].includes(
      normalized,
    )
  )
    return normalized
  return 'png'
}

/** 当前仅支持旋转，相邻旋转合并为一次处理，避免重复有损编码。 */
const compileMediaEdits = (operations: readonly EagleMediaEditOperation[]) => {
  const compiled: EagleMediaEditOperation[] = []
  for (const operation of operations) {
    switch (operation.type) {
      case 'rotate': {
        const previous = compiled.at(-1)
        if (previous?.type !== 'rotate') {
          compiled.push({ ...operation })
          break
        }
        const degrees = (previous.degrees + operation.degrees) % 360
        compiled.pop()
        if (degrees === 90 || degrees === 180 || degrees === 270)
          compiled.push({ type: 'rotate', degrees })
        break
      }
      default:
        // 新操作必须先实现处理器，不能静默跳过或假装保存成功。
        throw new Error('不支持的媒体编辑操作')
    }
  }
  return compiled
}

/** 先归正媒体方向，再应用编辑操作并一次编码、验证输出；多帧图片拒绝保存。 */
export const createEditedMedia = async (
  source: string,
  output: string,
  ext: string,
  video: boolean,
  operations: readonly EagleMediaEditOperation[],
  { signal, onProgress }: MediaEditProcessingOptions = {},
) => {
  signal?.throwIfAborted()
  const edits = compileMediaEdits(operations)
  let thumbnail: Buffer
  let width: number
  let height: number
  if (video) {
    if (!ffmpegPath) throw new Error('当前平台缺少视频编码器')
    const original = await readVideoMetadata(source, signal)
    signal?.throwIfAborted()
    onProgress?.({ percent: 0, phase: 'encoding', canCancel: true })
    const editFilters = edits.flatMap((operation) => {
      switch (operation.type) {
        case 'rotate':
          return operation.degrees === 90
            ? ['transpose=clock']
            : operation.degrees === 270
              ? ['transpose=cclock']
              : ['hflip', 'vflip']
        default:
          throw new Error('视频不支持此媒体编辑操作')
      }
    })
    // FFmpeg 自动应用输入的显示方向；输出清除旋转元数据，避免浏览器再次旋转。
    await run(
      ffmpegPath,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostdin',
        '-nostats',
        '-progress',
        'pipe:1',
        '-y',
        '-i',
        source,
        '-map',
        '0:v:0',
        '-map',
        '0:a?',
        '-sn',
        '-dn',
        '-vf',
        [
          'scale=iw*sar:ih',
          'setsar=1',
          ...editFilters,
          'pad=ceil(iw/2)*2:ceil(ih/2)*2',
        ].join(','),
        '-c:v',
        'libx264',
        '-preset',
        'medium',
        '-crf',
        '18',
        '-pix_fmt',
        'yuv420p',
        '-threads',
        '2',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-map_metadata',
        '-1',
        '-metadata:s:v:0',
        'rotate=0',
        '-movflags',
        '+faststart',
        '-f',
        'mp4',
        output,
      ],
      24 * 60 * 60 * 1000,
      signal,
      (line) => {
        if (!line.startsWith('out_time_us=')) return
        const seconds = Number(line.slice('out_time_us='.length)) / 1_000_000
        if (Number.isFinite(seconds))
          onProgress?.({
            percent: Math.min(
              90,
              Math.max(0, (seconds / original.duration) * 90),
            ),
            phase: 'encoding',
            canCancel: true,
          })
      },
    )
    signal?.throwIfAborted()
    onProgress?.({ percent: 92, phase: 'verifying', canCancel: true })
    await preserveMediaTimestamps(source, output, signal)
    const info = await readVideoMetadata(output, signal)
    width = info.width
    height = info.height
    const frame = await run(
      ffmpegPath,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostdin',
        '-i',
        output,
        '-map',
        '0:v:0',
        '-frames:v',
        '1',
        '-vf',
        'scale=400:400:force_original_aspect_ratio=decrease',
        '-f',
        'image2pipe',
        '-c:v',
        'png',
        'pipe:1',
      ],
      60_000,
      signal,
    )
    thumbnail = await sharp(frame).png().toBuffer()
  } else {
    let input: Buffer = await fs.readFile(source)
    if (['heic', 'heif'].includes(ext.toLowerCase()))
      input = (await encodeStaticHeif(input)).webp
    const metadata = await sharp(input, {
      failOn: 'warning',
      animated: true,
    }).metadata()
    // libvips 对 APNG 可能只报告首帧，显式检查 PNG 的动画控制块。
    if (
      input
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ) {
      for (let offset = 8; offset + 12 <= input.length; ) {
        const length = input.readUInt32BE(offset)
        if (input.toString('ascii', offset + 4, offset + 8) === 'acTL')
          throw new Error('暂不支持覆盖动画 PNG，原文件已保留')
        offset += length + 12
      }
    }
    if ((metadata.pages ?? 1) > 1)
      throw new Error('暂不支持覆盖多帧或多页图片，原文件已保留')
    const extension = editedMediaExtension(ext, false)
    const format =
      extension === 'jpg' ? 'jpeg' : extension === 'tif' ? 'tiff' : extension
    let image = sharp(input, { failOn: 'warning' }).autoOrient()
    for (const operation of edits) {
      switch (operation.type) {
        case 'rotate':
          image = image.rotate(operation.degrees)
          break
        default:
          throw new Error('图片不支持此媒体编辑操作')
      }
    }
    const result = await image
      .toFormat(format as keyof sharp.FormatEnum, { quality: 95 })
      .toBuffer({ resolveWithObject: true })
    await fs.writeFile(output, result.data, { flag: 'wx' })
    await preserveMediaTimestamps(source, output, signal)
    // 从实际输出完整解码，避免只依赖编码器返回信息。
    const verified = await sharp(await fs.readFile(output), {
      failOn: 'warning',
    })
      .raw()
      .toBuffer({ resolveWithObject: true })
    width = verified.info.width
    height = verified.info.height
    if (width !== result.info.width || height !== result.info.height)
      throw new Error('编辑后的图片验证失败')
    thumbnail = await sharp(result.data)
      .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer()
  }
  signal?.throwIfAborted()
  const handle = await fs.open(output, 'r+')
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
  return { width, height, thumbnail }
}
