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
      '-time:all',
      '--System:all',
      '--File:all',
      '--Composite:all',
    ],
    ignoreMinorErrors: false,
  })
  if (raw.errors?.length)
    throw new Error(`读取媒体时间戳失败：${raw.errors.join('；')}`)
  return Object.fromEntries(
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
}

/** 保留原始组名和原始值，不推断时区，不复制尺寸、方向或时长。 */
export const preserveMediaTimestamps = async (
  source: string,
  output: string,
) => {
  // ExifTool 的 stay_open 协议按行传参，不能接受路径中的控制字符。
  if (/[\r\n\0]/.test(source + output))
    throw new Error('媒体路径包含不支持的控制字符')
  const tool = new ExifTool({
    maxProcs: 1,
    taskTimeoutMillis: 120_000,
    useMWG: false,
    ignoreMinorErrors: false,
  })
  try {
    const original = await readTimestampTags(tool, source)
    const keys = Object.keys(original)
    if (!keys.length) return
    await tool.write(
      output,
      {},
      {
        ignoreMinorErrors: false,
        writeArgs: [
          '-overwrite_original',
          '-TagsFromFile',
          source,
          ...keys.map((key) => `-${key}`),
        ],
      },
    )
    const saved = await readTimestampTags(tool, output)
    const missing = keys.filter(
      (key) => JSON.stringify(saved[key]) !== JSON.stringify(original[key]),
    )
    if (missing.length)
      throw new Error(
        `输出格式无法完整保留媒体时间戳（${missing.join('、')}），未覆盖原文件`,
      )
  } finally {
    await tool.end()
  }
}

/** Node utimes 不支持创建时间；Windows 用系统自带 .NET API，路径作为数据传入。 */
export const preserveFileTimestamps = async (file: string, original: Stats) => {
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
      execFile(
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
          if (error) reject(new Error(`保留文件创建时间失败：${error.message}`))
          else resolve()
        },
      )
    })
  }
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
