// 小说模块 CRUD 接口封装（生成相关的 LLM 调用与编排在 service/ 下，不在此文件）
// 参考文/设定/大纲/正文/摘要统一为 NovelText，共用一套 texts 接口
import type { AppType } from '@/server'
import type { NovelConfig } from '@/server/module/novel/config'
import { hc } from 'hono/client'
import { DEFAULT_RECENT_FULL_CHAPTERS } from './service/constants'
import type {
  Novel,
  NovelChapter,
  NovelIndexItem,
  NovelText,
  NovelTextType,
} from './types'

const client = hc<AppType>('/')

// 统一解包 { success, data | error } 响应，失败抛出带中文信息的 Error
const unwrap = async <T>(p: Promise<Response>): Promise<T> => {
  const res = await p
  const json = (await res.json()) as
    | { success: true; data: T }
    | { success: false; error: string }
  if (!json.success) throw new Error(json.error || '请求失败')
  return json.data
}

const unwrapOk = async (p: Promise<Response>): Promise<void> => {
  const res = await p
  const json = (await res.json()) as { success: boolean; error?: string }
  if (!json.success) throw new Error(json.error || '操作失败')
}

// ---------- 书籍 ----------

export const listNovels = () =>
  unwrap<NovelIndexItem[]>(client.api.novel.novels.$get())

export const createNovel = (title: string) =>
  unwrap<Novel>(
    client.api.novel.novels.$post({
      json: { title, recentFullChapters: DEFAULT_RECENT_FULL_CHAPTERS },
    }),
  )

export const getNovel = (id: string) =>
  unwrap<Novel>(client.api.novel.novels[':id'].$get({ param: { id } }))

export const updateNovel = (
  id: string,
  patch: { title?: string; recentFullChapters?: number },
) =>
  unwrap<Novel>(
    client.api.novel.novels[':id'].$patch({
      param: { id },
      json: patch,
    }),
  )

export const deleteNovel = (id: string) =>
  unwrapOk(
    client.api.novel.novels[':id'].$delete({
      param: { id },
    }),
  )

// ---------- 统一文本 CRUD ----------

export const createText = (
  novelId: string,
  payload: {
    type: NovelTextType
    chapterId?: string
    title?: string
    content: string
    sourceIds?: string[]
    estimatedTokens?: number
    originalLength?: number
  },
) =>
  unwrap<NovelText>(
    client.api.novel.novels[':id'].texts.$post({
      param: { id: novelId },
      json: payload,
    }),
  )

export const updateText = (
  novelId: string,
  textId: string,
  patch: { title?: string; content?: string; sourceIds?: string[] },
) =>
  unwrap<NovelText>(
    client.api.novel.novels[':id'].texts[':textId'].$patch({
      param: { id: novelId, textId },
      json: patch,
    }),
  )

export const deleteText = (novelId: string, textId: string) =>
  unwrapOk(
    client.api.novel.novels[':id'].texts[':textId'].$delete({
      param: { id: novelId, textId },
    }),
  )

// ---------- 章节 ----------

export const createChapter = (novelId: string) =>
  unwrap<NovelChapter>(
    client.api.novel.novels[':id'].chapters.$post({
      param: { id: novelId },
    }),
  )

export const updateChapter = (novelId: string, cid: string, title: string) =>
  unwrap<NovelChapter>(
    client.api.novel.novels[':id'].chapters[':cid'].$patch({
      param: { id: novelId, cid },
      json: { title },
    }),
  )

export const deleteChapter = (novelId: string, cid: string) =>
  unwrapOk(
    client.api.novel.novels[':id'].chapters[':cid'].$delete({
      param: { id: novelId, cid },
    }),
  )

// ---------- 模块配置（data/novels/config.json） ----------

export const getNovelConfig = () =>
  unwrap<NovelConfig>(client.api.novel.novels.config.$get())

export const updateNovelConfig = (patch: Partial<NovelConfig>) =>
  unwrap<NovelConfig>(client.api.novel.novels.config.$post({ json: patch }))
