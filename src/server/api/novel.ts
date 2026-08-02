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

// 生成编排（prompt 组装、大纲解析、落盘）已全部前移到前端
// src/client/pages/module/Novel/service/，后端只保留 CRUD、/novels/config 配置读写与 /llm 纯代理

const snapshotSchema = z.object({
  refIds: z.array(z.string()),
  settingIds: z.array(z.string()),
  fullChapterIds: z.array(z.string()),
  summaryChapterIds: z.array(z.string()),
  estimatedTokens: z.number(),
})

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
  // 书的完整数据（含设定、章节；参考文不含正文）
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
  // 上传参考文（前端已截断/校验，originalLength 为截断前字符数）
  .post(
    '/novels/:id/refs',
    zValidator('param', z.object({ id: z.string() })),
    zValidator(
      'json',
      z.object({
        title: z.string().min(1),
        content: z.string(),
        originalLength: z.number().int().nonnegative().optional(),
      }),
    ),
    async (c) => {
      try {
        const { title, content, originalLength } = c.req.valid('json')
        const ref = await novelStore.addRef(
          c.req.valid('param').id,
          title,
          content,
          originalLength,
        )
        if (!ref) {
          return c.json(
            { success: false as const, error: '[小说] 书籍不存在' },
            404,
          )
        }
        return c.json({ success: true as const, data: ref })
      } catch (error: any) {
        return c.json({ success: false as const, error: error.message }, 400)
      }
    },
  )
  // 删参考文
  .delete(
    '/novels/:id/refs/:refId',
    zValidator('param', z.object({ id: z.string(), refId: z.string() })),
    async (c) => {
      const { id, refId } = c.req.valid('param')
      const ok = await novelStore.deleteRef(id, refId)
      if (!ok) {
        return c.json(
          { success: false as const, error: '[小说] 参考文不存在' },
          404,
        )
      }
      return c.json({ success: true as const })
    },
  )
  // 取参考文内容（编辑/查看/前端组装上下文用）
  .get(
    '/novels/:id/refs/:refId/content',
    zValidator('param', z.object({ id: z.string(), refId: z.string() })),
    async (c) => {
      const { id, refId } = c.req.valid('param')
      const content = await novelStore.getRefContent(id, refId)
      if (content === null) {
        return c.json(
          { success: false as const, error: '[小说] 参考文不存在' },
          404,
        )
      }
      return c.json({ success: true as const, data: { content } })
    },
  )
  // 手动新增设定卡片
  .post(
    '/novels/:id/settings',
    zValidator('param', z.object({ id: z.string() })),
    zValidator(
      'json',
      z.object({ title: z.string().min(1), content: z.string() }),
    ),
    async (c) => {
      const { title, content } = c.req.valid('json')
      const setting = await novelStore.addSetting(
        c.req.valid('param').id,
        title,
        content,
      )
      if (!setting) {
        return c.json(
          { success: false as const, error: '[小说] 书籍不存在' },
          404,
        )
      }
      return c.json({ success: true as const, data: setting })
    },
  )
  // 编辑设定
  .patch(
    '/novels/:id/settings/:sid',
    zValidator('param', z.object({ id: z.string(), sid: z.string() })),
    zValidator(
      'json',
      z.object({
        title: z.string().min(1).optional(),
        content: z.string().optional(),
      }),
    ),
    async (c) => {
      const { id, sid } = c.req.valid('param')
      const setting = await novelStore.updateSetting(
        id,
        sid,
        c.req.valid('json'),
      )
      if (!setting) {
        return c.json(
          { success: false as const, error: '[小说] 设定不存在' },
          404,
        )
      }
      return c.json({ success: true as const, data: setting })
    },
  )
  // 删除设定
  .delete(
    '/novels/:id/settings/:sid',
    zValidator('param', z.object({ id: z.string(), sid: z.string() })),
    async (c) => {
      const { id, sid } = c.req.valid('param')
      const ok = await novelStore.deleteSetting(id, sid)
      if (!ok) {
        return c.json(
          { success: false as const, error: '[小说] 设定不存在' },
          404,
        )
      }
      return c.json({ success: true as const })
    },
  )
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
  // 编辑章节（标题/大纲/正文/摘要/状态/上下文快照均可局部更新）
  .patch(
    '/novels/:id/chapters/:cid',
    zValidator('param', z.object({ id: z.string(), cid: z.string() })),
    zValidator(
      'json',
      z.object({
        title: z.string().optional(),
        outline: z
          .object({
            beats: z.array(z.string()),
            tone: z.string().optional(),
            taboos: z.string().optional(),
          })
          .nullable()
          .optional(),
        outlineContext: snapshotSchema.nullable().optional(),
        content: z.string().optional(),
        contentContext: snapshotSchema.nullable().optional(),
        summary: z.string().optional(),
        status: z
          .enum(['outlining', 'outlined', 'writing', 'written', 'summarized'])
          .optional(),
      }),
    ),
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
  // 删除章节（仅限最后一章，避免序号空洞）
  .delete(
    '/novels/:id/chapters/:cid',
    zValidator('param', z.object({ id: z.string(), cid: z.string() })),
    async (c) => {
      try {
        const { id, cid } = c.req.valid('param')
        const ok = await novelStore.deleteChapter(id, cid)
        if (!ok) {
          return c.json(
            { success: false as const, error: '[小说] 章节不存在' },
            404,
          )
        }
        return c.json({ success: true as const })
      } catch (error: any) {
        return c.json({ success: false as const, error: error.message }, 400)
      }
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

      // 非流式：章节摘要、大纲 JSON 修复重试
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
