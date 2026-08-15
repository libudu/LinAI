import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import OpenAI from 'openai'
import { z } from 'zod'
import {
  getNovelConfig,
  getNovelEndpoint,
  updateNovelConfig,
} from '../module/novel/config'

// 小说数据已由前端通过通用实体接口（/api/storage/entities/novel.books）整体读写，
// 后端不再保留字段级 CRUD；本文件只剩模块配置读写与 /llm 纯代理
const novelApi = new Hono()
  // 小说模块配置（独立存储 data/novels/config.json）
  .get('/novels/config', (c) => {
    return c.json({ success: true as const, data: getNovelConfig() })
  })
  .post(
    '/novels/config',
    zValidator(
      'json',
      z.object({
        novelApiKey: z.string().nullable().optional(),
        novelBaseUrl: z.string().nullable().optional(),
        novelModelId: z.string().nullable().optional(),
      }),
    ),
    (c) => {
      return c.json({
        success: true as const,
        data: updateNovelConfig(c.req.valid('json')),
      })
    },
  )
  // LLM 纯代理：转发 OpenAI 兼容请求（API Key/模型由后端配置持有），不含任何业务逻辑
  // stream: true → SSE（delta/done/error）；stream: false → 普通 JSON
  .post(
    '/llm',
    zValidator(
      'json',
      z.object({
        messages: z.array(
          z.object({
            role: z.enum(['system', 'user', 'assistant']),
            content: z.string(),
          }),
        ),
        temperature: z.number().min(0).max(2),
        stream: z.boolean(),
      }),
    ),
    async (c) => {
      const { messages, temperature, stream } = c.req.valid('json')
      const { apiKey, baseUrl, modelId } = getNovelEndpoint()
      if (!apiKey) {
        return c.json(
          {
            success: false as const,
            error: '[配置] 请先在设置中配置小说生成的 API Key',
          },
          400,
        )
      }
      const client = new OpenAI({ apiKey, baseURL: baseUrl })

      // 非流式：章节摘要等短文本任务
      if (!stream) {
        try {
          const res = await client.chat.completions.create({
            model: modelId,
            messages,
            temperature,
          })
          return c.json({
            success: true as const,
            data: { content: res.choices?.[0]?.message?.content ?? '' },
          })
        } catch (error: any) {
          return c.json(
            {
              success: false as const,
              error: `[DeepSeek] ${error?.message || '请求失败'}`,
            },
            500,
          )
        }
      }

      return streamSSE(c, async (sse) => {
        // 前端断开（含主动 abort）即中断上游
        const controller = new AbortController()
        let disconnected = false
        sse.onAbort(() => {
          disconnected = true
          controller.abort()
        })
        const safeWrite = async (
          event: string,
          data: Record<string, unknown>,
        ) => {
          if (disconnected) return
          try {
            await sse.writeSSE({ event, data: JSON.stringify(data) })
          } catch {
            disconnected = true
          }
        }

        try {
          const upstream = await client.chat.completions.create(
            {
              model: modelId,
              messages,
              temperature,
              stream: true,
              stream_options: { include_usage: true },
            },
            { signal: controller.signal },
          )
          let usage: unknown = null
          for await (const chunk of upstream) {
            const delta = chunk.choices?.[0]?.delta?.content
            if (delta) await safeWrite('delta', { text: delta })
            if (chunk.usage) usage = chunk.usage
          }
          await safeWrite('done', { usage: usage ?? undefined })
        } catch (error: any) {
          // 前端主动断开导致的上游 abort 静默结束
          if (controller.signal.aborted) return
          await safeWrite('error', {
            message: `[DeepSeek] ${error?.message || '生成请求失败'}`,
          })
        }
      })
    },
  )

export default novelApi
