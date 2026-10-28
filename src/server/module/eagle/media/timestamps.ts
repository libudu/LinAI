import exifr from 'exifr'
import { execFile } from 'node:child_process'
import type { Stats } from 'node:fs'
import fs from 'node:fs/promises'
import sharp from 'sharp'
import type { VideoCreationTimes } from './video-metadata'

// 数字标签避免 exifr 与 libexif 的命名差异；只复制时间，不沿用旧方向、尺寸和缩略图。
const imageTimeTags = [
  ['ifd0', 0x0132, 'IFD0', 'DateTime'],
  ['exif', 0x9003, 'IFD2', 'DateTimeOriginal'],
  ['exif', 0x9004, 'IFD2', 'DateTimeDigitized'],
  ['exif', 0x9010, 'IFD2', 'OffsetTime'],
  ['exif', 0x9011, 'IFD2', 'OffsetTimeOriginal'],
  ['exif', 0x9012, 'IFD2', 'OffsetTimeDigitized'],
  // libexif 的 0x9290 名称是 SubsecTime，另外两个标签却使用 SubSecTime 前缀。
  ['exif', 0x9290, 'IFD2', 'SubsecTime'],
  ['exif', 0x9291, 'IFD2', 'SubSecTimeOriginal'],
  ['exif', 0x9292, 'IFD2', 'SubSecTimeDigitized'],
] as const

type ImageTimestamps = Record<string, Record<string, string>>

/** exifr 7 不支持 WebP，且不能读取部分 AVIF/HEIF 布局；从原图提取 EXIF 后解析。 */
export const readImageTimestamps = async (
  input: Buffer,
  extension: string,
): Promise<ImageTimestamps> => {
  const ext = extension.toLowerCase()
  let data: Buffer
  // TIFF 的 IFD 就在文件内，Sharp 不提供独立的 metadata.exif。
  if (['tif', 'tiff'].includes(ext)) {
    data = input
  } else {
    const metadata = await sharp(input, { failOn: 'warning' }).metadata()
    if (!metadata.exif) return {}
    data = metadata.exif
    if (data.subarray(0, 6).equals(Buffer.from('Exif\0\0')))
      data = data.subarray(6)
  }
  const options = {
    translateKeys: false,
    translateValues: false,
    reviveValues: false,
    sanitize: false,
    mergeOutput: false,
    silentErrors: false,
    ifd0: { pick: [0x0132] },
    exif: {
      pick: imageTimeTags
        .filter(([block]) => block === 'exif')
        .map(([, id]) => id),
    },
    ifd1: false,
    gps: false,
    interop: false,
    xmp: false,
    iptc: false,
    icc: false,
    jfif: false,
    ihdr: false,
    makerNote: false,
    userComment: false,
  }
  const parsed: Record<string, Record<number, unknown>> | undefined =
    await exifr.parse(data, options)
  const times: ImageTimestamps = {}
  for (const [block, id, ifd, name] of imageTimeTags) {
    const value = parsed?.[block]?.[id]
    if (value === undefined) continue
    if (typeof value !== 'string' || !value.length || /[\0\r\n]/.test(value))
      throw new Error('图片时间字段无效：' + name + '，未覆盖原文件')
    const entries = (times[ifd] ??= {})
    entries[name] = value
  }
  return times
}

/** 在唯一一次编码时写入；TIFF/GIF 编码器不能保存 EXIF，不能静默丢日期。 */
export const withImageTimestamps = (
  image: sharp.Sharp,
  times: ImageTimestamps,
  format: string,
) => {
  if (!Object.keys(times).length) return image
  if (!['jpeg', 'png', 'webp', 'avif'].includes(format))
    throw new Error(
      '当前编码器无法保留 ' + format + ' 的 EXIF 时间，原文件已保留',
    )
  return image.withExif(times)
}

export const verifyImageTimestamps = async (
  times: ImageTimestamps,
  output: Buffer,
  format: string,
  signal?: AbortSignal,
) => {
  signal?.throwIfAborted()
  const saved = await readImageTimestamps(output, format)
  signal?.throwIfAborted()
  // 同时检查不存在的字段，避免编码器凭空补当前日期。
  if (JSON.stringify(times) !== JSON.stringify(saved))
    throw new Error('输出图片的常见 EXIF 时间回读不一致，未覆盖原文件')
}

/** 只接受明确带时区的 ISO 日期，不能把原文件的本地时间猜成 UTC。 */
const checkedVideoTime = (value: string | undefined) => {
  if (value === undefined) return undefined
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(
      value,
    ) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new Error('视频创建时间没有有效的明确时区，未覆盖原文件')
  return value
}

export const videoTimestampArgs = (times: VideoCreationTimes) => {
  const args = [
    '-map_metadata',
    '-1',
    '-map_metadata:s',
    '-1',
    '-map_chapters',
    '-1',
  ]
  const add = (scope: string, value: string | undefined) => {
    args.push(
      '-metadata' + scope,
      'creation_time=' + (checkedVideoTime(value) ?? ''),
    )
  }
  add('', times.container)
  add(':s:v:0', times.video)
  times.audio.forEach((time, index) => add(':s:a:' + index, time))
  // mdta 保留容器日期的偏移和小数原文；普通 mvhd/tkhd 只能保存 UTC 整秒。
  return [...args, '-movflags', '+faststart+use_metadata_tags']
}

export const verifyVideoTimestamps = (
  original: VideoCreationTimes,
  saved: VideoCreationTimes,
) => {
  const matches = (source: string | undefined, target: string | undefined) => {
    checkedVideoTime(source)
    checkedVideoTime(target)
    // 等价时刻允许 FFmpeg 规范化 UTC，但小数部分不能用 Date 的毫秒精度比较。
    if (source === undefined || target === undefined) return source === target
    const fraction = (value: string) =>
      (value.match(/\.(\d+)/)?.[1] ?? '').replace(/0+$/, '')
    return (
      Date.parse(source) === Date.parse(target) &&
      fraction(source) === fraction(target)
    )
  }
  checkedVideoTime(original.container)
  checkedVideoTime(saved.container)
  if (
    original.container !== saved.container ||
    !matches(original.video, saved.video) ||
    original.audio.length !== saved.audio.length ||
    original.audio.some((time, index) => !matches(time, saved.audio[index]))
  )
    throw new Error(
      'MP4 无法保留原视频的容器/音视频流创建时间（流级独立日期或子秒可能不受支持），未覆盖原文件',
    )
}

/** Node utimes 不支持创建时间；Windows 用系统自带 .NET API，路径作为数据传入。 */
export const preserveFileTimestamps = async (
  file: string,
  original: Stats,
  signal?: AbortSignal,
) => {
  signal?.throwIfAborted()
  if (process.platform === 'win32') {
    const script = [
      "$ErrorActionPreference = 'Stop'",
      '$timeInfo = ConvertFrom-Json $env:LINAI_ROTATION_TIME_INFO',
      '$wholeMilliseconds = [long][Math]::Floor($timeInfo.birthtimeMs)',
      '$fractionTicks = [long][Math]::Round(($timeInfo.birthtimeMs - $wholeMilliseconds) * 10000)',
      '$creation = [DateTimeOffset]::FromUnixTimeMilliseconds($wholeMilliseconds).UtcDateTime.AddTicks($fractionTicks)',
      '[System.IO.File]::SetCreationTimeUtc($timeInfo.path, $creation)',
    ].join('\n')
    await new Promise<void>((resolve, reject) => {
      const child = execFile(
        'powershell.exe',
        ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
        {
          windowsHide: true,
          timeout: 60_000,
          maxBuffer: 1024 * 1024,
          env: {
            ...process.env,
            LINAI_ROTATION_TIME_INFO: JSON.stringify({
              path: file,
              birthtimeMs: original.birthtimeMs,
            }),
          },
        },
        (error) => {
          signal?.removeEventListener('abort', abort)
          if (signal?.aborted) reject(signal.reason)
          else if (error)
            reject(new Error(`保留文件创建时间失败：${error.message}`))
          else resolve()
        },
      )
      const abort = () => child.kill()
      signal?.addEventListener('abort', abort, { once: true })
    })
  }
  signal?.throwIfAborted()
  await fs.utimes(file, original.atimeMs / 1000, original.mtimeMs / 1000)
  const saved = await fs.lstat(file)
  if (
    Math.abs(saved.atimeMs - original.atimeMs) > 1 ||
    Math.abs(saved.mtimeMs - original.mtimeMs) > 1 ||
    (process.platform === 'win32' &&
      Math.abs(saved.birthtimeMs - original.birthtimeMs) > 1)
  ) {
    throw new Error('文件系统无法保留原始创建、修改或访问时间，未覆盖原文件')
  }
}
