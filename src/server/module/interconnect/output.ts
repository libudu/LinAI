import type { Readable } from 'node:stream'
import { stripVTControlCharacters } from 'node:util'

const MAX_LINE = 8192
const ERROR_LEASE_MS = 30000

// 单次探测、握手、心跳及转发超时不代表整个房间故障，持续失败由房间状态提示。
function isConnectionRetry(message: string) {
  return (
    /^connect timeout after /i.test(message) ||
    /^handshake timeout after /i.test(message) ||
    /^wait response error:\s*conn closed during wait handshake response\b/i.test(
      message,
    ) ||
    /^port-forward connect failed\b.*\bkind:\s*DeadlineExceeded\b/i.test(
      message,
    ) ||
    /^too many consecutive pingpong failures, closing the connection\b/i.test(
      message,
    ) ||
    /^forward packet error\b.*\bPeerNoConnectionError\(/i.test(message)
  )
}

/** 分别保留核心错误与连接重试诊断；原始配置、普通日志和接入密钥不对外返回。 */
export class CoreOutput {
  private errors = new Map<string, number>()
  private connectionRetries = new Map<string, number>()
  private secrets: string[]

  constructor(secrets: (string | undefined)[]) {
    this.secrets = secrets.filter((value): value is string => Boolean(value))
  }

  sanitize(text: string) {
    let value = stripVTControlCharacters(text)
    for (const secret of this.secrets)
      value = value.split(secret).join('[REDACTED]')
    return value
      .replace(/[A-Za-z0-9+/]{43}=/g, '[REDACTED]')
      .replace(/[a-f0-9]{64}/gi, '[REDACTED]')
      .replace(
        /((?:network_secret|networkSecret|private_key|credential_secret|authorization|eagleSecret)[^:=]*[:=]).*/gi,
        '$1 [REDACTED]',
      )
      .slice(0, MAX_LINE)
  }

  attach(stream: Readable) {
    let pending = ''
    stream.setEncoding('utf8')
    stream.on('data', (chunk: string) => {
      pending += chunk
      let end: number
      while ((end = pending.indexOf('\n')) !== -1) {
        this.record(pending.slice(0, end))
        pending = pending.slice(end + 1)
      }
      // 丢弃超长行，不把被截断的配置尾部误认为下一条错误。
      if (pending.length > MAX_LINE) pending = pending.slice(0, MAX_LINE)
    })
    stream.on('end', () => this.record(pending))
  }

  private record(raw: string) {
    const line = stripVTControlCharacters(raw).trim()
    if (!line) return
    const log = line.match(
      /^\S+\s+(TRACE|DEBUG|INFO|WARN|ERROR)\s+\S+:\s*(.*)$/,
    )
    if (log && !['WARN', 'ERROR'].includes(log[1])) return
    if (log?.[2].startsWith('session id mismatch, clear saved info')) return
    // 启动时可能直接打印整份配置；无日志级别的输出只接受错误链或 panic。
    if (
      !log &&
      !/^(?:error(?:\[[^\]]+\])?:|failed\b|caused by:|\d+:|thread .+panicked)|\(os error \d+\)/i.test(
        line,
      )
    )
      return
    let message = log?.[2] ?? line
    if (
      !/(?:error|fail(?:ed|ure)?|Err\(|panic|timed?\s*out|timeout|refused|unreachable|denied|^\d+:|^Caused by:)/i.test(
        message,
      )
    )
      return
    const reconnect = message.indexOf('reconnect_result=Err(')
    if (reconnect !== -1)
      message = message
        .slice(reconnect + 'reconnect_result=Err('.length)
        .replace(/\)$/, '')
    message = this.sanitize(message)
    const entries = isConnectionRetry(message)
      ? this.connectionRetries
      : this.errors
    entries.delete(message)
    entries.set(message, Date.now())
    if (entries.size > 8) entries.delete(entries.keys().next().value!)
  }

  clearConnectionRetries() {
    this.connectionRetries.clear()
  }

  message({ includeConnectionRetries = true } = {}) {
    const now = Date.now()
    for (const entries of [this.errors, this.connectionRetries])
      for (const [message, time] of entries)
        if (now - time > ERROR_LEASE_MS) entries.delete(message)
    return [
      ...this.errors,
      ...(includeConnectionRetries ? this.connectionRetries : []),
    ]
      .sort((a, b) => a[1] - b[1])
      .slice(-4)
      .map(([message]) => message)
      .join('\n')
  }
}
