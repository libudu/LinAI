// 小说模块数据访问层（生成相关的 LLM 调用与编排在 service/ 下，不在此文件）
// 书籍数据走通用实体接口（novel.books）：章节/文段增删、删章节级联、摘要计算全部在前端完成，
// 每次修改整体读改写并携带 expectedRevision；模块配置走 /api/settings/novel，LLM 请求走 /api/relay/novel.openai
import { entityClient, mutateEntity } from '@/client/service/storage'
import { DEFAULT_RECENT_FULL_CHAPTERS } from './service/constants'
import type {
  ArtifactType,
  ChatMessage,
  Novel,
  NovelArtifact,
  NovelChapter,
  NovelIndexItem,
  NovelSummary,
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
    artifacts: [],
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

// ---------- 统一文段 CRUD（参考文/设定/大纲/正文/摘要，前端业务修改） ----------

export const createArtifact = (
  novelId: string,
  payload: {
    type: ArtifactType
    chapterId?: string
    title?: string
    content: string
    inputs?: string[]
    estimatedTokens?: number
    originalLength?: number
  },
): Promise<NovelArtifact> =>
  mutateNovel(novelId, (novel) => {
    const now = Date.now()
    const artifact: NovelArtifact = {
      id: crypto.randomUUID(),
      type: payload.type,
      title: payload.title ?? '',
      content: payload.content,
      inputs: payload.inputs ?? [],
      version: 1,
      messages: [],
      createdAt: now,
      updatedAt: now,
    }
    if (payload.chapterId) artifact.chapterId = payload.chapterId
    if (payload.estimatedTokens !== undefined) {
      artifact.estimatedTokens = payload.estimatedTokens
    }
    if (payload.originalLength !== undefined) {
      artifact.originalLength = payload.originalLength
    }
    novel.artifacts.push(artifact)
    return artifact
  })

export const updateArtifact = (
  novelId: string,
  artifactId: string,
  patch: {
    title?: string
    content?: string
    inputs?: string[]
    messages?: ChatMessage[]
  },
): Promise<NovelArtifact> =>
  mutateNovel(novelId, (novel) => {
    const artifact = novel.artifacts.find((t) => t.id === artifactId)
    if (!artifact) throw new Error('[小说] 文段不存在')
    if (patch.title !== undefined) artifact.title = patch.title
    // 任何内容修改（含手动编辑）版本号 +1
    if (patch.content !== undefined && patch.content !== artifact.content) {
      artifact.content = patch.content
      artifact.version += 1
    }
    if (patch.inputs !== undefined) artifact.inputs = patch.inputs
    if (patch.messages !== undefined) artifact.messages = patch.messages
    artifact.updatedAt = Date.now()
    return artifact
  })

export const deleteArtifact = (
  novelId: string,
  artifactId: string,
): Promise<void> =>
  mutateNovel(novelId, (novel) => {
    if (!novel.artifacts.some((t) => t.id === artifactId)) {
      throw new Error('[小说] 文段不存在')
    }
    novel.artifacts = novel.artifacts.filter((t) => t.id !== artifactId)
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

// 删章节并级联删除其归属文段（「仅可删最后一章」的规则由页面控制）
export const deleteChapter = (novelId: string, cid: string): Promise<void> =>
  mutateNovel(novelId, (novel) => {
    if (!novel.chapters.some((c) => c.id === cid)) {
      throw new Error('[小说] 章节不存在')
    }
    novel.chapters = novel.chapters.filter((c) => c.id !== cid)
    novel.artifacts = novel.artifacts.filter((t) => t.chapterId !== cid)
  })
