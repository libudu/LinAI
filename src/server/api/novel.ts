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
import { novelStore } from '../module/novel/store'

// 生成编排（prompt 组装、上下文勾选、落盘）全部在前端
// src/client/pages/module/Novel/service/，后端只保留 CRUD、/novels/config 配置读写与 /llm 纯代理
// 参考文/设定/大纲/正文/摘要统一为 NovelText，共用一套 /texts 端点

const novelApi = new Hono()
  // 书籍列表（index.json）
  .get('/novels', async (c) => {
    try {
      const novels = await novelStore.listNovels()
      return c.json({ success: true as const, data: novels })
    } catch (error: any) {
      return c.json({ success: false as const, error: error.message }, 500)
    }
  })
  // 创建书（recentFullChapters 默认值由前端传入）
  .post(
    '/novels',
    zValidator(
      'json',
      z.object({
        title: z.string().min(1),
        recentFullChapters: z.number().int().min(0).max(20),
      }),
    ),
    async (c) => {
      try {
        const { title, recentFullChapters } = c.req.valid('json')
        const novel = await novelStore.createNovel(title, recentFullChapters)
        return c.json({ success: true as const, data: novel })
      } catch (error: any) {
        return c.json({ success: false as const, error: error.message }, 500)
      }
    },
  )
  // 小说模块配置（独立存储 data/novels/config.json）；注册在 /novels/:id 之前避免被参数路由抢占
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
  // 书的完整数据（章节 + 全部文本内联）
  .get(
    '/novels/:id',
    zValidator('param', z.object({ id: z.string() })),
    async (c) => {
      const novel = await novelStore.getNovel(c.req.valid('param').id)
      if (!novel) {
        return c.json(
          { success: false as const, error: '[小说] 书籍不存在' },
          404,
        )
      }
      return c.json({ success: true as const, data: novel })
    },
  )
  // 改标题、recentFullChapters
  .patch(
    '/novels/:id',
    zValidator('param', z.object({ id: z.string() })),
    zValidator(
      'json',
      z.object({
        title: z.string().min(1).optional(),
        recentFullChapters: z.number().int().min(0).max(20).optional(),
      }),
    ),
    async (c) => {
      const novel = await novelStore.updateNovel(
        c.req.valid('param').id,
        c.req.valid('json'),
      )
      if (!novel) {
        return c.json(
          { success: false as const, error: '[小说] 书籍不存在' },
          404,
        )
      }
      return c.json({ success: true as const, data: novel })
    },
  )
  // 删书（含目录）
  .delete(
    '/novels/:id',
    zValidator('param', z.object({ id: z.string() })),
    async (c) => {
      const ok = await novelStore.deleteNovel(c.req.valid('param').id)
      if (!ok) {
        return c.json(
          { success: false as const, error: '[小说] 书籍不存在' },
          404,
        )
      }
      return c.json({ success: true as const })
    },
  )
  // ---------- 统一文本 CRUD（参考文/设定/大纲/正文/摘要） ----------
  // 新增文本
  .post(
    '/novels/:id/texts',
    zValidator('param', z.object({ id: z.string() })),
    zValidator(
      'json',
      z.object({
        type: z.enum(['ref', 'setting', 'outline', 'content', 'summary']),
        chapterId: z.string().optional(),
        title: z.string().optional(),
        content: z.string(),
        sourceIds: z.array(z.string()).optional(),
        estimatedTokens: z.number().optional(),
        originalLength: z.number().int().nonnegative().optional(),
      }),
    ),
    async (c) => {
      const text = await novelStore.createText(
        c.req.valid('param').id,
        c.req.valid('json'),
      )
      if (!text) {
        return c.json(
          { success: false as const, error: '[小说] 书籍不存在' },
          404,
        )
      }
      return c.json({ success: true as const, data: text })
    },
  )
  // 编辑文本（标题/内容/来源引用均可局部更新）
  .patch(
    '/novels/:id/texts/:textId',
    zValidator('param', z.object({ id: z.string(), textId: z.string() })),
    zValidator(
      'json',
      z.object({
        title: z.string().optional(),
        content: z.string().optional(),
        sourceIds: z.array(z.string()).optional(),
      }),
    ),
    async (c) => {
      const { id, textId } = c.req.valid('param')
      const text = await novelStore.updateText(id, textId, c.req.valid('json'))
      if (!text) {
        return c.json(
          { success: false as const, error: '[小说] 文本不存在' },
          404,
        )
      }
      return c.json({ success: true as const, data: text })
    },
  )
  // 删除文本
  .delete(
    '/novels/:id/texts/:textId',
    zValidator('param', z.object({ id: z.string(), textId: z.string() })),
    async (c) => {
      const { id, textId } = c.req.valid('param')
      const ok = await novelStore.deleteText(id, textId)
      if (!ok) {
        return c.json(
          { success: false as const, error: '[小说] 文本不存在' },
          404,
        )
      }
      return c.json({ success: true as const })
    },
  )
  // ---------- 章节（轻量分组容器） ----------
  // 新增空白章节（前端生成下一章大纲前创建）
  .post(
    '/novels/:id/chapters',
    zValidator('param', z.object({ id: z.string() })),
    async (c) => {
      const chapter = await novelStore.addChapter(c.req.valid('param').id)
      if (!chapter) {
        return c.json(
          { success: false as const, error: '[小说] 书籍不存在' },
          404,
        )
      }
      return c.json({ success: true as const, data: chapter })
    },
  )
  // 改章节标题
  .patch(
    '/novels/:id/chapters/:cid',
    zValidator('param', z.object({ id: z.string(), cid: z.string() })),
    zValidator('json', z.object({ title: z.string() })),
    async (c) => {
      const { id, cid } = c.req.valid('param')
      const chapter = await novelStore.updateChapter(
        id,
        cid,
        c.req.valid('json'),
      )
      if (!chapter) {
        return c.json(
          { success: false as const, error: '[小说] 章节不存在' },
          404,
        )
      }
      return c.json({ success: true as const, data: chapter })
    },
  )
  // 删除章节（级联删除其归属文本；「仅可删最后一章」由前端控制）
  .delete(
    '/novels/:id/chapters/:cid',
    zValidator('param', z.object({ id: z.string(), cid: z.string() })),
    async (c) => {
      const { id, cid } = c.req.valid('param')
      const ok = await novelStore.deleteChapter(id, cid)
      if (!ok) {
        return c.json(
          { success: false as const, error: '[小说] 章节不存在' },
          404,
        )
      }
      return c.json({ success: true as const })
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
