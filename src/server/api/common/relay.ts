import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { RelayError, requestRegistry } from '../../common/relay'
// 注册所有中继目标（副作用）
import '../../common/relay/resources'

/**
 * 受限请求中继（§8）：POST /api/relay/:target
 * 客户端只提交 { method?, path, body? }，目标 origin、方法与路径白名单、
 * 凭据注入全部由服务端注册定义控制，不开放任意 URL / 任意头代理。
 * 上游为 SSE 时逐事件透传（data 原样转发），客户端断开即中断上游。
 */
const relayApi = new Hono().post(
  '/:target',
  zValidator(
    'json',
    z.object({
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).optional(),
      path: z.string().min(1).max(2048),
      body: z.unknown().optional(),
    }),
  ),
  async (c) => {
    const target = c.req.param('target')
    const { method, path, body } = c.req.valid('json')
    // 客户端断开时中断上游（流式场景在 streamSSE 内生效）
    const controller = new AbortController()

    let upstream: Response
    try {
      upstream = await requestRegistry.execute(
        target,
        { method, path, body },
        controller.signal,
      )
    } catch (error: any) {
      if (error instanceof RelayError) {
        return c.json(
          { success: false as const, error: error.message },
          error.status as 400,
        )
      }
      throw error
    }

    const contentType = upstream.headers.get('content-type') ?? ''
    const wantsStream =
      typeof body === 'object' &&
      body !== null &&
      (body as Record<string, unknown>).stream === true

    if (
      upstream.ok &&
      wantsStream &&
      contentType.includes('text/event-stream')
    ) {
      return streamSSE(c, async (sse) => {
        let disconnected = false
        sse.onAbort(() => {
          disconnected = true
          controller.abort()
        })
        try {
          const reader = upstream.body!.getReader()
          const decoder = new TextDecoder()
          let buffer = ''
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            // SSE 事件以空行分隔，逐事件透传 data 负载
            let match: RegExpExecArray | null
            const boundary = /\r?\n\r?\n/g
            let lastEnd = 0
            while ((match = boundary.exec(buffer)) !== null) {
              const rawEvent = buffer.slice(lastEnd, match.index)
              lastEnd = match.index + match[0].length
              const data = rawEvent
                .split(/\r?\n/)
                .filter((line) => line.startsWith('data:'))
                .map((line) => line.slice(5).trimStart())
                .join('\n')
              if (!data || disconnected) continue
              try {
                await sse.writeSSE({ data })
              } catch {
                disconnected = true
                controller.abort()
                return
              }
            }
            buffer = buffer.slice(lastEnd)
          }
        } catch {
          // 客户端主动断开导致的上游 abort 静默结束
        }
      })
    }

    // 非流式：限制响应体大小，JSON 原样透传
    const maxBytes = 8 * 1024 * 1024
    const reader = upstream.body?.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.byteLength
        if (total > maxBytes) {
          controller.abort()
          return c.json(
            { success: false as const, error: '[中继] 上游响应超出大小限制' },
            502,
          )
        }
        chunks.push(value)
      }
    }
    const text = new TextDecoder().decode(
      chunks.reduce((acc, c) => {
        const merged = new Uint8Array(acc.length + c.length)
        merged.set(acc)
        merged.set(c, acc.length)
        return merged
      }, new Uint8Array(0)),
    )

    if (!upstream.ok) {
      // 提取上游错误信息（OpenAI 风格 {error:{message}}），截断防超长
      let detail = text.slice(0, 500)
      try {
        const json = JSON.parse(text)
        detail = json?.error?.message || json?.message || detail
      } catch {
        /* 非 JSON 错误体直接用原文 */
      }
      const host = new URL(upstream.url).host
      const status =
        upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502
      return c.json(
        {
          success: false as const,
          error: `[${host}] ${detail || `HTTP ${upstream.status}`}`,
        },
        status as 400,
      )
    }

    try {
      return c.json({ success: true as const, data: JSON.parse(text) })
    } catch {
      return c.json({ success: true as const, data: text })
    }
  },
)

export default relayApi
