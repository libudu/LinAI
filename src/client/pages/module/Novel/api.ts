// 小说模块 CRUD 接口封装（生成相关的 LLM 调用与编排在 service/ 下，不在此文件）
import { hc } from 'hono/client'
import type { AppType } from '../../../../server'
import type { NovelConfig } from '../../../../server/module/novel/config'
import { DEFAULT_RECENT_FULL_CHAPTERS } from './service/constants'
import type {
  ContextSnapshot,
  Novel,
  NovelChapter,
  NovelChapterStatus,
  NovelIndexItem,
  NovelOutline,
  NovelRef,
  NovelSetting,
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

// ---------- 参考文 ----------

// content 为前端截断后的内容，originalLength 为截断前字符数（用于 truncated 标记）
export const addRef = (
  novelId: string,
  title: string,
  content: string,
  originalLength?: number,
) =>
  unwrap<NovelRef>(
    client.api.novel.novels[':id'].refs.$post({
      param: { id: novelId },
      json: { title, content, originalLength },
    }),
  )

export const deleteRef = (novelId: string, refId: string) =>
  unwrapOk(
    client.api.novel.novels[':id'].refs[':refId'].$delete({
      param: { id: novelId, refId },
    }),
  )

export const getRefContent = (novelId: string, refId: string) =>
  unwrap<{ content: string }>(
    client.api.novel.novels[':id'].refs[':refId'].content.$get({
      param: { id: novelId, refId },
    }),
  )

// ---------- 核心设定 ----------

export const addSetting = (novelId: string, title: string, content: string) =>
  unwrap<NovelSetting>(
    client.api.novel.novels[':id'].settings.$post({
      param: { id: novelId },
      json: { title, content },
    }),
  )

export const updateSetting = (
  novelId: string,
  sid: string,
  patch: { title?: string; content?: string },
) =>
  unwrap<NovelSetting>(
    client.api.novel.novels[':id'].settings[':sid'].$patch({
      param: { id: novelId, sid },
      json: patch,
    }),
  )

export const deleteSetting = (novelId: string, sid: string) =>
  unwrapOk(
    client.api.novel.novels[':id'].settings[':sid'].$delete({
      param: { id: novelId, sid },
    }),
  )

// ---------- 章节 ----------

export const createChapter = (novelId: string) =>
  unwrap<NovelChapter>(
    client.api.novel.novels[':id'].chapters.$post({
      param: { id: novelId },
    }),
  )

export const updateChapter = (
  novelId: string,
  cid: string,
  patch: {
    title?: string
    outline?: NovelOutline | null
    outlineContext?: ContextSnapshot | null
    content?: string
    contentContext?: ContextSnapshot | null
    summary?: string
    status?: NovelChapterStatus
  },
) =>
  unwrap<NovelChapter>(
    client.api.novel.novels[':id'].chapters[':cid'].$patch({
      param: { id: novelId, cid },
      json: patch,
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
