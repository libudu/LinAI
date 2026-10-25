import { ExifTool } from 'exiftool-vendored'
import { execFile } from 'node:child_process'
import type { Stats } from 'node:fs'
import fs from 'node:fs/promises'

/** 只取实际日期、时区、子秒等时间标签，排除文件系统字段、派生值和媒体时长。 */
const readTimestampTags = async (tool: ExifTool, file: string) => {
  const raw = await tool.readRaw(file, {
    readArgs: [
      '-G1',
      '-a',
      '-s',
      '-n',
      '-HandlerType',
      '-time:all',
      '--System:all',
      '--File:all',
      '--Composite:all',
    ],
    ignoreMinorErrors: false,
  })
  if (raw.errors?.length)
    throw new Error(`读取媒体时间戳失败：${raw.errors.join('；')}`)
  const tracks = Object.entries(raw)
    .flatMap(([key, handler]) => {
      const match = key.match(/^(Track\d+):HandlerType$/)
      return match ? [{ group: match[1], handler: String(handler) }] : []
    })
    .sort((a, b) => Number(a.group.slice(5)) - Number(b.group.slice(5)))
  const timestamps = Object.fromEntries(
    Object.entries(raw).filter(([key]) => {
      const separator = key.lastIndexOf(':')
      if (separator < 0 || /^(System|File|Composite|ExifTool):/.test(key))
        return false
      if (!/^[\w][\w:-]*$/.test(key))
        throw new Error('媒体时间戳标签名称无效，未覆盖原文件')
      const name = key.slice(separator + 1)
      if (
        /Duration|TimeScale|TimeCode|^(PreviewTime|SelectionTime|CurrentTime|StartTime|EndTime)$/i.test(
          name,
        )
      )
        return false
      return /Date|Timestamp|Time$|^(TimeCreated|OffsetTime\w*|SubSecTime\w*|TimeZone\w*)$/i.test(
        name,
      )
    }),
  )
  return { timestamps, tracks }
}

type TimestampMetadata = Awaited<ReturnType<typeof readTimestampTags>>

/** 与 FFmpeg 的首个视频流 + 全部音轨映射保持一致，不复制已丢弃辅助轨道的日期。 */
const videoTimestampCopies = (
  original: TimestampMetadata,
  output: TimestampMetadata,
) => {
  const trackMap = new Map<string, string>()
  for (const handler of ['vide', 'soun']) {
    const sourceTracks = original.tracks.filter(
      (track) => track.handler === handler,
    )
    const retained =
      handler === 'vide' ? sourceTracks.slice(0, 1) : sourceTracks
    const targets = output.tracks.filter((track) => track.handler === handler)
    if (retained.length && retained.length !== targets.length)
      throw new Error('输出视频的音视频轨道与输入不匹配，无法保留时间戳')
    retained.forEach((track, index) =>
      trackMap.set(track.group, targets[index].group),
    )
  }
  return Object.keys(original.timestamps).flatMap((sourceKey) => {
    // Track1Keys 等轨道级子组也随其所属轨道重映射。
    const group = sourceKey.match(/^(Track\d+)(?=\D)/)?.[1]
    if (!group) return [{ sourceKey, targetKey: sourceKey }]
    const target = trackMap.get(group)
    if (target)
      return [{ sourceKey, targetKey: target + sourceKey.slice(group.length) }]
    if (!original.tracks.some((track) => track.group === group))
      throw new Error(`无法识别 ${group} 的媒体类型，未保存输出`)
    // Hint、字幕、数据轨道和额外视频流未输出，不要求重建其日期标签。
    return []
  })
}

/** 保留原始值；视频按实际输出轨道重映射组名，不推断时区或复制尺寸、时长。 */
export const preserveMediaTimestamps = async (
  source: string,
  output: string,
  signal?: AbortSignal,
  { video = false }: { video?: boolean } = {},
) => {
  signal?.throwIfAborted()
  // ExifTool 的 stay_open 协议按行传参，不能接受路径中的控制字符。
  if (/[\r\n\0]/.test(source + output))
    throw new Error('媒体路径包含不支持的控制字符')
  const tool = new ExifTool({
    maxProcs: 1,
    taskTimeoutMillis: 120_000,
    useMWG: false,
    ignoreMinorErrors: false,
  })
  let stopping: Promise<void> | undefined
  const abort = () => {
    stopping ??= tool.end(false)
    void stopping.catch(() => undefined)
  }
  signal?.addEventListener('abort', abort, { once: true })
  try {
    const original = await readTimestampTags(tool, source)
    signal?.throwIfAborted()
    const copies = video
      ? videoTimestampCopies(original, await readTimestampTags(tool, output))
      : Object.keys(original.timestamps).map((key) => ({
          sourceKey: key,
          targetKey: key,
        }))
    signal?.throwIfAborted()
    if (!copies.length) return
    await tool.write(
      output,
      {},
      {
        ignoreMinorErrors: false,
        writeArgs: [
          '-overwrite_original',
          '-TagsFromFile',
          source,
          ...copies.map(({ sourceKey, targetKey }) =>
            sourceKey === targetKey
              ? `-${sourceKey}`
              : `-${targetKey}<${sourceKey}`,
          ),
        ],
      },
    )
    signal?.throwIfAborted()
    const saved = await readTimestampTags(tool, output)
    signal?.throwIfAborted()
    const missing = copies
      .filter(
        ({ sourceKey, targetKey }) =>
          JSON.stringify(saved.timestamps[targetKey]) !==
          JSON.stringify(original.timestamps[sourceKey]),
      )
      .map(({ targetKey }) => targetKey)
    if (missing.length)
      throw new Error(
        `输出格式无法完整保留媒体时间戳（${missing.join('、')}），未覆盖原文件`,
      )
  } catch (error) {
    signal?.throwIfAborted()
    throw error
  } finally {
    signal?.removeEventListener('abort', abort)
    await (stopping ?? tool.end(!signal?.aborted))
  }
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
    Math.abs(saved.mtimeMs - original.mtimeMs) > 1 ||
    (process.platform === 'win32' &&
      Math.abs(saved.birthtimeMs - original.birthtimeMs) > 1)
  ) {
    throw new Error('文件系统无法保留原始创建或修改时间，未覆盖原文件')
  }
}
