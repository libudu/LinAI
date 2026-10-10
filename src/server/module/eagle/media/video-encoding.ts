import type { readVideoMetadata } from './video-metadata'

type VideoMetadata = Awaited<ReturnType<typeof readVideoMetadata>>

const mp4AudioCodecs = new Set(['aac', 'mp3', 'ac3', 'eac3', 'alac'])

/** 旋转需要重新编码画面，沿用可支持的原编码，以原平均码率作为体积目标。 */
export const getVideoEncodingArgs = (
  original: VideoMetadata,
  sourceSize: number,
) => {
  const codec = original.codec
  const encoder =
    codec === 'hevc'
      ? 'libx265'
      : codec === 'vp9'
        ? 'libvpx-vp9'
        : codec === 'av1'
          ? 'libaom-av1'
          : 'libx264'
  const codecArgs =
    encoder === 'libx265'
      ? [
          '-preset',
          'medium',
          '-x265-params',
          'pools=2:frame-threads=2',
          '-tag:v',
          'hvc1',
        ]
      : encoder === 'libvpx-vp9'
        ? ['-deadline', 'good', '-cpu-used', '4']
        : encoder === 'libaom-av1'
          ? ['-cpu-used', '6']
          : ['-preset', 'medium']
  // 保留常见色度采样和位深；不沿用原 profile/level，避免旋转后的尺寸不再符合限制。
  const pixelFormat =
    original.pixelFormat &&
    /^yuv(?:420|422|444)p(?:10le)?$/.test(original.pixelFormat)
      ? original.pixelFormat
      : 'yuv420p'
  const audioArgs = original.audio.flatMap((audio, index) => {
    if (audio.codec && mp4AudioCodecs.has(audio.codec))
      return [`-c:a:${index}`, 'copy']
    // 不兼容 MP4 的音轨才转 AAC，不再一律提高到 192k。
    return [
      `-c:a:${index}`,
      'aac',
      `-b:a:${index}`,
      String(audio.bitrate ?? 128_000),
    ]
  })
  // 缺少流码率时用文件平均总码率减去音频；不能把总码率直接当作视频码率。
  const duration =
    Number.isFinite(original.containerDuration) &&
    original.containerDuration > 0
      ? original.containerDuration
      : original.duration
  const totalBitrate = (sourceSize * 8) / duration
  const audioBitrate = original.audio.reduce(
    (sum, audio) => sum + (audio.bitrate ?? 128_000),
    0,
  )
  const estimatedBitrate = totalBitrate * 0.98 - audioBitrate
  const bitrate = Math.max(
    1,
    Math.round(
      original.bitrate ??
        (estimatedBitrate > 0 ? estimatedBitrate : totalBitrate * 0.8),
    ),
  )
  return [
    '-c:v',
    encoder,
    ...codecArgs,
    '-b:v',
    String(bitrate),
    '-pix_fmt',
    pixelFormat,
    '-fps_mode:v',
    'passthrough',
    '-enc_time_base:v',
    '-1',
    '-threads',
    '2',
    ...audioArgs,
  ]
}
