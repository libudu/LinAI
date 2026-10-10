import ffmpegPath from 'ffmpeg-static'
import { execFile } from 'node:child_process'

const parseDuration = (value?: string) => {
  const match = value?.match(/^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/)
  return match
    ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
    : NaN
}

/** 只读输入头并映射首个视频流，不转码、不写文件，也不遍历整个视频。 */
export const readVideoMetadata = async (
  filePath: string,
  signal?: AbortSignal,
) => {
  signal?.throwIfAborted()
  const executable = ffmpegPath
  if (!executable) throw new Error('当前平台缺少视频解码器')
  const diagnostics = await new Promise<string>((resolve, reject) => {
    execFile(
      executable,
      [
        '-hide_banner',
        '-loglevel',
        'info',
        '-nostdin',
        '-nostats',
        '-i',
        filePath,
        '-map',
        '0:v:0',
        '-c',
        'copy',
        '-t',
        '0',
        '-f',
        'null',
        '-',
      ],
      {
        encoding: 'utf8',
        windowsHide: true,
        signal,
        timeout: 60_000,
        maxBuffer: 2 * 1024 * 1024,
      },
      (error, _stdout, stderr) => {
        if (error)
          reject(
            new Error(
              `视频信息读取失败：${stderr.trim().slice(-500) || error.message}`,
            ),
          )
        else resolve(stderr)
      },
    )
  })
  signal?.throwIfAborted()
  // 只解析输入区段，避免把输出流或 codec tag 中的十六进制值当成尺寸。
  const input = diagnostics.split(/^Output #/m)[0]
  const stream = input
    .split(/^\s{2}Stream #0:/m)
    .slice(1)
    .find((section) => /^[^\r\n]*: Video:/.test(section))
  if (!stream) throw new Error('文件没有可解码的视频画面')
  const dimensions = stream
    .split(/\r?\n/, 1)[0]
    .match(/(?:^|[\s,])(\d+)x(\d+)(?=[\s,\[]|$)/)
  const width = Number(dimensions?.[1])
  const height = Number(dimensions?.[2])
  if (!width || !height) throw new Error('无法读取有效的视频尺寸')
  // MKV 等容器可提供视频流自己的 DURATION，优先于包含音频的容器时长。
  const streamDuration = parseDuration(
    stream.match(/^\s+DURATION\s*:\s*(\S+)/im)?.[1],
  )
  const duration =
    Number.isFinite(streamDuration) && streamDuration > 0
      ? streamDuration
      : parseDuration(input.match(/^\s+Duration:\s*(\S+),/m)?.[1])
  if (!Number.isFinite(duration) || duration <= 0)
    throw new Error('无法读取有效的视频时长')
  return { width, height, duration }
}
