// 受限请求中继（/api/relay/novel.openai）的封装：流式（SSE-over-POST）与非流式两种调用
// API Key 与模型由后端设置持有并注入，前端只发 messages + temperature；
// 中继逐事件透传上游 OpenAI 兼容 SSE（data 为原始 chunk 或 [DONE]）
import type { ChatMessage } from '../types'

interface SSEEvent {
  event: string
  data: string
}

// 解析单个 SSE 事件块（event:/data: 行，忽略注释行）
const parseEventBlock = (block: string): SSEEvent | null => {
  let event = 'message'
  const dataLines: string[] = []
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^ /, ''))
    }
  }
  if (dataLines.length === 0) return null
  return { event, data: dataLines.join('\n') }
}

// fetch + ReadableStream 手动解析 SSE（EventSource 只支持 GET，见 implementation-plan.md 3.2）
async function* readSSE(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<SSEEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const SEPARATOR = /\r?\n\r?\n/
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let match: RegExpMatchArray | null
      while ((match = buffer.match(SEPARATOR))) {
        const block = buffer.slice(0, match.index)
        buffer = buffer.slice((match.index ?? 0) + match[0].length)
        const event = parseEventBlock(block)
        if (event) yield event
      }
    }
    // 流末尾可能残留一个未以空行结尾的事件块
    const tail = parseEventBlock(buffer)
    if (tail) yield tail
  } finally {
    reader.releaseLock()
  }
}

// 流期间上游报错时抛出，partial 携带已生成的部分文本（供调用方按部分结果落盘）
export class GenerationError extends Error {
  constructor(
    message: string,
    public readonly partial: string,
  ) {
    super(message)
  }
}

export interface StreamResult {
  text: string
  usage: unknown | null
  aborted: boolean
}

// OpenAI 兼容流式 chunk 的最小形状
interface ChatCompletionChunk {
  choices?: { delta?: { content?: string } }[]
  usage?: unknown
  error?: { message?: string }
}

// 流式生成：delta 通过 onDelta 透出并累积；signal 中断时返回已生成的部分文本（aborted: true）
export const chatStream = async (opts: {
  messages: ChatMessage[]
  temperature: number
  signal: AbortSignal
  onDelta?: (text: string) => void
}): Promise<StreamResult> => {
  let buffer = ''
  let usage: unknown | null = null

  let res: Response
  try {
    res = await fetch('/api/relay/novel.openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: '/chat/completions',
        body: {
          messages: opts.messages,
          temperature: opts.temperature,
          stream: true,
          stream_options: { include_usage: true },
        },
      }),
      signal: opts.signal,
    })
  } catch (error: any) {
    if (opts.signal.aborted) return { text: '', usage: null, aborted: true }
    throw new Error(error?.message || '生成请求失败')
  }
  if (!res.ok || !res.body) {
    let msg = `生成请求失败（${res.status}）`
    try {
      const json = (await res.json()) as { error?: string }
      if (json.error) msg = json.error
    } catch {
      // 保留默认错误信息
    }
    throw new Error(msg)
  }

  try {
    for await (const evt of readSSE(res.body)) {
      if (evt.data === '[DONE]') break
      const chunk = JSON.parse(evt.data) as ChatCompletionChunk
      if (chunk.error) {
        throw new GenerationError(chunk.error.message || '生成失败', buffer)
      }
      const text = chunk.choices?.[0]?.delta?.content ?? ''
      if (text) {
        buffer += text
        opts.onDelta?.(text)
      }
      if (chunk.usage) usage = chunk.usage
    }
  } catch (error: any) {
    // 主动 abort：保留已生成部分，正常返回
    if (opts.signal.aborted) return { text: buffer, usage, aborted: true }
    if (error instanceof GenerationError) throw error
    throw new GenerationError(error?.message || '生成失败', buffer)
  }
  return { text: buffer, usage, aborted: opts.signal.aborted }
}

// 非流式调用（章节摘要、大纲 JSON 修复重试）
export const chatOnce = async (opts: {
  messages: ChatMessage[]
  temperature: number
}): Promise<string> => {
  const res = await fetch('/api/relay/novel.openai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: '/chat/completions',
      body: {
        messages: opts.messages,
        temperature: opts.temperature,
        stream: false,
      },
    }),
  })
  const json = (await res.json()) as
    | {
        success: true
        data: { choices?: { message?: { content?: string } }[] }
      }
    | { success: false; error: string }
  if (!json.success) throw new Error(json.error || '请求失败')
  return json.data.choices?.[0]?.message?.content ?? ''
}
