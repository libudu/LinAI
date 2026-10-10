import ffmpegPath from 'ffmpeg-static'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import sharp from 'sharp'
import { encodeStaticHeif } from './heic'
import { preserveMediaTimestamps } from './timestamps'
import { readVideoMetadata } from './video-metadata'

/** 转码允许长时间运行，参数不经过 shell，Windows 不弹出命令窗口。 */
const run = (executable: string, args: string[], timeout = 60_000) =>
  new Promise<Buffer>((resolve, reject) => {
    execFile(
      executable,
      args,
      {
        encoding: 'buffer',
        windowsHide: true,
        timeout,
        maxBuffer: 2 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error)
          reject(
            new Error(
              `媒体旋转失败：${stderr.toString().trim().slice(-500) || error.message}`,
            ),
          )
        else resolve(stdout)
      },
    )
  })

export const rotatedExtension = (ext: string, video: boolean) => {
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

/** 图片先按 EXIF 归正，再应用预览里的顺时针角度；不把多帧文件静默变成单帧。 */
export const createRotatedMedia = async (
  source: string,
  output: string,
  ext: string,
  video: boolean,
  degrees: number,
) => {
  let thumbnail: Buffer
  let width: number
  let height: number
  if (video) {
    if (!ffmpegPath) throw new Error('当前平台缺少视频编码器')
    const transpose =
      degrees === 90
        ? 'transpose=clock'
        : degrees === 270
          ? 'transpose=cclock'
          : 'hflip,vflip'
    // FFmpeg 自动应用输入的显示方向；输出清除旋转元数据，避免浏览器再次旋转。
    await run(
      ffmpegPath,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostdin',
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
        `scale=iw*sar:ih,setsar=1,${transpose},pad=ceil(iw/2)*2:ceil(ih/2)*2`,
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
    )
    await preserveMediaTimestamps(source, output)
    const info = await readVideoMetadata(output)
    width = info.width
    height = info.height
    const frame = await run(ffmpegPath, [
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
    ])
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
    const extension = rotatedExtension(ext, false)
    const format =
      extension === 'jpg' ? 'jpeg' : extension === 'tif' ? 'tiff' : extension
    const result = await sharp(input, { failOn: 'warning' })
      .autoOrient()
      .rotate(degrees)
      .toFormat(format as keyof sharp.FormatEnum, { quality: 95 })
      .toBuffer({ resolveWithObject: true })
    await fs.writeFile(output, result.data, { flag: 'wx' })
    await preserveMediaTimestamps(source, output)
    // 从实际输出完整解码，避免只依赖编码器返回信息。
    const verified = await sharp(await fs.readFile(output), {
      failOn: 'warning',
    })
      .raw()
      .toBuffer({ resolveWithObject: true })
    width = verified.info.width
    height = verified.info.height
    if (width !== result.info.width || height !== result.info.height)
      throw new Error('旋转后的图片验证失败')
    thumbnail = await sharp(result.data)
      .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer()
  }
  const handle = await fs.open(output, 'r+')
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
  return { width, height, thumbnail }
}
