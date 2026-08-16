// 小说模块数据访问层（生成相关的 LLM 调用与编排在 service/ 下，不在此文件）
// 书籍数据走通用实体接口（novel.books）：章节/文本增删、删章节级联、摘要计算全部在前端完成，
// 每次修改整体读改写并携带 expectedRevision；模块配置走 /api/settings/novel，LLM 请求走 /api/relay/novel.openai
import { entityClient, mutateEntity } from '@/client/service/storage'
import { DEFAULT_RECENT_FULL_CHAPTERS } from './service/constants'
import type {
  Novel,
  NovelChapter,
  NovelIndexItem,
  NovelSummary,
  NovelText,
  NovelTextType,
} from './types'

const novelsClient = entityClient<Novel, NovelSummary>('novel.books')

const summaryOf = (novel: Novel): NovelSummary => ({
  title: novel.title,
  chapterCount: novel.chapters.length,
})

// 读改写整体保存：通用重试循环收敛在 mutateEntity（storage.ts），此处只保留业务修改
const mutateNovel = async <R>(
  id: string,
  mutate: (novel: Novel) => R,
): Promise<R> => {
  const { result } = await mutateEntity(
    novelsClient,
    id,
    (novel) => {
      const result = mutate(novel)
      novel.updatedAt = Date.now()
      return result
    },
    summaryOf,
  )
  return result
}

// ---------- 书籍 ----------

export const listNovels = async (): Promise<NovelIndexItem[]> => {
  const items = await novelsClient.list()
  return items.map((e) => ({
    id: e.id,
    title: e.summary.title,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    chapterCount: e.summary.chapterCount,
  }))
}

export const createNovel = async (title: string): Promise<Novel> => {
  const now = Date.now()
  const novel: Novel = {
    id: crypto.randomUUID(),
    title,
    chapters: [],
    texts: [],
    recentFullChapters: DEFAULT_RECENT_FULL_CHAPTERS,
    createdAt: now,
    updatedAt: now,
  }
  await novelsClient.create(novel, summaryOf(novel), novel.id)
  return novel
}

export const getNovel = async (id: string): Promise<Novel> =>
  (await novelsClient.get(id)).value

export const updateNovel = (
  id: string,
  patch: { title?: string; recentFullChapters?: number },
): Promise<Novel> =>
  mutateNovel(id, (novel) => {
    if (patch.title !== undefined) novel.title = patch.title
    if (patch.recentFullChapters !== undefined) {
      novel.recentFullChapters = patch.recentFullChapters
    }
    return novel
  })

export const deleteNovel = (id: string): Promise<void> =>
  novelsClient.remove(id)

// ---------- 统一文本 CRUD（参考文/设定/大纲/正文/摘要，前端业务修改） ----------

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
): Promise<NovelText> =>
  mutateNovel(novelId, (novel) => {
    const now = Date.now()
    const text: NovelText = {
      id: crypto.randomUUID(),
      type: payload.type,
      title: payload.title ?? '',
      content: payload.content,
      sourceIds: payload.sourceIds ?? [],
      createdAt: now,
      updatedAt: now,
    }
    if (payload.chapterId) text.chapterId = payload.chapterId
    if (payload.estimatedTokens !== undefined) {
      text.estimatedTokens = payload.estimatedTokens
    }
    if (payload.originalLength !== undefined) {
      text.originalLength = payload.originalLength
    }
    novel.texts.push(text)
    return text
  })

export const updateText = (
  novelId: string,
  textId: string,
  patch: { title?: string; content?: string; sourceIds?: string[] },
): Promise<NovelText> =>
  mutateNovel(novelId, (novel) => {
    const text = novel.texts.find((t) => t.id === textId)
    if (!text) throw new Error('[小说] 文本不存在')
    if (patch.title !== undefined) text.title = patch.title
    if (patch.content !== undefined) text.content = patch.content
    if (patch.sourceIds !== undefined) text.sourceIds = patch.sourceIds
    text.updatedAt = Date.now()
    return text
  })

export const deleteText = (novelId: string, textId: string): Promise<void> =>
  mutateNovel(novelId, (novel) => {
    if (!novel.texts.some((t) => t.id === textId)) {
      throw new Error('[小说] 文本不存在')
    }
    novel.texts = novel.texts.filter((t) => t.id !== textId)
  })

// ---------- 章节（轻量分组容器） ----------

// 新增空白章节（生成下一章大纲前创建）
export const createChapter = (novelId: string): Promise<NovelChapter> =>
  mutateNovel(novelId, (novel) => {
    const now = Date.now()
    const chapter: NovelChapter = {
      id: crypto.randomUUID(),
      title: '',
      createdAt: now,
      updatedAt: now,
    }
    novel.chapters.push(chapter)
    return chapter
  })

export const updateChapter = (
  novelId: string,
  cid: string,
  title: string,
): Promise<NovelChapter> =>
  mutateNovel(novelId, (novel) => {
    const chapter = novel.chapters.find((c) => c.id === cid)
    if (!chapter) throw new Error('[小说] 章节不存在')
    chapter.title = title
    chapter.updatedAt = Date.now()
    return chapter
  })

// 删章节并级联删除其归属文本（「仅可删最后一章」的规则由页面控制）
export const deleteChapter = (novelId: string, cid: string): Promise<void> =>
  mutateNovel(novelId, (novel) => {
    if (!novel.chapters.some((c) => c.id === cid)) {
      throw new Error('[小说] 章节不存在')
    }
    novel.chapters = novel.chapters.filter((c) => c.id !== cid)
    novel.texts = novel.texts.filter((t) => t.chapterId !== cid)
  })
