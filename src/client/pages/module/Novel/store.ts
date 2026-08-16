import { message } from 'antd'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import * as api from './api'
import { REF_MAX_CHARS } from './service/constants'
import { runGeneration, type GenerateRequest } from './service/generate'
import type {
  ArtifactRevision,
  ChatMessage,
  Novel,
  NovelIndexItem,
  StreamingState,
} from './types'
import { streamingTargetOf } from './types'

// 当前生成任务的中断控制器（单页单任务，由 streaming 状态保证互斥）
let generationController: AbortController | null = null

// 「生成文段」模态框的打开意图（默认勾选规则由 service/context 按产出类型计算）
export interface GenerateModalRequest {
  outputType: 'setting' | 'outline' | 'content'
  /** outline 缺省时生成开始后自动新建章节；content 必传 */
  chapterId?: string
}

interface NovelStore {
  // 书籍索引与当前书
  novels: NovelIndexItem[]
  currentNovelId: string | null
  currentNovel: Novel | null
  loadingNovels: boolean
  loadingNovel: boolean

  // 流式生成状态（模态框关闭后生成仍在后台继续，节点卡片显示生成中态）
  streaming: StreamingState | null
  /** 「生成文段」模态框 */
  generateModal: GenerateModalRequest | null
  openGenerateModal: (req: GenerateModalRequest) => void
  closeGenerateModal: () => void
  /** 「节点」模态框（值为文段 id；打开期间画布高亮其 inputs 来源节点） */
  nodeModalId: string | null
  openNodeModal: (artifactId: string) => void
  closeNodeModal: () => void

  // 书籍
  fetchNovels: () => Promise<void>
  selectNovel: (id: string | null) => void
  fetchNovel: (id: string) => Promise<void>
  createNovel: (title: string) => Promise<boolean>
  removeNovel: (id: string) => Promise<boolean>
  updateNovelMeta: (
    id: string,
    patch: { title?: string; recentFullChapters?: number },
  ) => Promise<boolean>

  // 统一文段操作（参考文/设定/大纲/正文/摘要）
  uploadRef: (title: string, content: string) => Promise<boolean>
  createArtifact: (
    payload: Parameters<typeof api.createArtifact>[1],
  ) => Promise<string | null>
  updateArtifact: (
    artifactId: string,
    patch: {
      title?: string
      content?: string
      messages?: ChatMessage[]
      /** 内容修改的历史快照来源（缺省 'manual'）与触发指令 */
      revision?: { source: ArtifactRevision['source']; instruction?: string }
    },
  ) => Promise<boolean>
  deleteArtifact: (artifactId: string) => Promise<boolean>
  /** 复制文段（手动分叉）：新 id、version=1、messages=[]、无历史 */
  duplicateArtifact: (artifactId: string) => Promise<string | null>

  // 章节
  editChapterTitle: (cid: string, title: string) => Promise<boolean>
  removeChapter: (cid: string) => Promise<boolean>

  // 生成闭环：置 streaming → delta 逐段 append → done/断线清 streaming 并重新拉取书籍
  startGeneration: (req: GenerateRequest) => Promise<void>
  abortGeneration: () => Promise<void>
}

export const useNovelStore = create<NovelStore>()(
  persist(
    (set, get) => ({
      novels: [],
      currentNovelId: null,
      currentNovel: null,
      loadingNovels: false,
      loadingNovel: false,
      streaming: null,
      generateModal: null,
      nodeModalId: null,

      openGenerateModal: (req) => set({ generateModal: req }),
      closeGenerateModal: () => set({ generateModal: null }),
      openNodeModal: (artifactId) => set({ nodeModalId: artifactId }),
      closeNodeModal: () => set({ nodeModalId: null }),

      fetchNovels: async () => {
        set({ loadingNovels: true })
        try {
          const novels = await api.listNovels()
          set({ novels })
          // 持久化的当前书已被删除时回到未选中状态（展示欢迎页），不自动选中其他书
          const { currentNovelId } = get()
          if (currentNovelId && !novels.some((n) => n.id === currentNovelId)) {
            set({ currentNovelId: null, currentNovel: null })
          }
        } catch (error: any) {
          message.error(error.message || '获取书籍列表失败')
        } finally {
          set({ loadingNovels: false })
        }
      },

      selectNovel: (id) => set({ currentNovelId: id, currentNovel: null }),

      fetchNovel: async (id) => {
        set({ loadingNovel: true })
        try {
          const novel = await api.getNovel(id)
          set({ currentNovel: novel })
        } catch (error: any) {
          message.error(error.message || '获取书籍失败')
          set({ currentNovelId: null, currentNovel: null })
        } finally {
          set({ loadingNovel: false })
        }
      },

      createNovel: async (title) => {
        try {
          const novel = await api.createNovel(title)
          message.success('创建成功')
          set({ currentNovelId: novel.id, currentNovel: novel })
          await get().fetchNovels()
          return true
        } catch (error: any) {
          message.error(error.message || '创建失败')
          return false
        }
      },

      removeNovel: async (id) => {
        try {
          await api.deleteNovel(id)
          message.success('已删除')
          if (get().currentNovelId === id) {
            set({ currentNovelId: null, currentNovel: null })
          }
          await get().fetchNovels()
          return true
        } catch (error: any) {
          message.error(error.message || '删除失败')
          return false
        }
      },

      updateNovelMeta: async (id, patch) => {
        try {
          const novel = await api.updateNovel(id, patch)
          if (get().currentNovelId === id) set({ currentNovel: novel })
          await get().fetchNovels()
          return true
        } catch (error: any) {
          message.error(error.message || '保存失败')
          return false
        }
      },

      // 上传参考文：前端截取超限部分，落盘为 type='ref' 的文段
      uploadRef: async (title, content) => {
        const novel = get().currentNovel
        if (!novel) return false
        // 前端截取：超过单篇上限只保留末尾
        const stored =
          content.length > REF_MAX_CHARS
            ? content.slice(-REF_MAX_CHARS)
            : content
        const artifactId = await get().createArtifact({
          type: 'ref',
          title,
          content: stored,
          originalLength: content.length,
        })
        if (artifactId) {
          message.success(
            stored.length < content.length
              ? `已上传（超长已截断：原 ${content.length.toLocaleString()} 字 → 取末尾 ${stored.length.toLocaleString()} 字）`
              : '已上传',
          )
        }
        return !!artifactId
      },

      createArtifact: async (payload) => {
        const novel = get().currentNovel
        if (!novel) return null
        try {
          const artifact = await api.createArtifact(novel.id, payload)
          set({
            currentNovel: {
              ...novel,
              artifacts: [...novel.artifacts, artifact],
            },
          })
          return artifact.id
        } catch (error: any) {
          message.error(error.message || '保存失败')
          return null
        }
      },

      updateArtifact: async (artifactId, patch) => {
        const novel = get().currentNovel
        if (!novel) return false
        try {
          const artifact = await api.updateArtifact(novel.id, artifactId, patch)
          set({
            currentNovel: {
              ...novel,
              artifacts: novel.artifacts.map((t) =>
                t.id === artifactId ? artifact : t,
              ),
            },
          })
          return true
        } catch (error: any) {
          message.error(error.message || '保存失败')
          return false
        }
      },

      deleteArtifact: async (artifactId) => {
        const novel = get().currentNovel
        if (!novel) return false
        try {
          await api.deleteArtifact(novel.id, artifactId)
          set({
            currentNovel: {
              ...novel,
              artifacts: novel.artifacts.filter((t) => t.id !== artifactId),
            },
          })
          message.success('已删除')
          return true
        } catch (error: any) {
          message.error(error.message || '删除失败')
          return false
        }
      },

      // 复制文段（手动分叉）：新 id、version=1、messages=[]、无历史；inputs 溯源保留
      duplicateArtifact: async (artifactId) => {
        const novel = get().currentNovel
        if (!novel) return null
        const source = novel.artifacts.find((t) => t.id === artifactId)
        if (!source) return null
        try {
          const copy = await api.createArtifact(novel.id, {
            type: source.type,
            chapterId: source.chapterId,
            title: source.title ? `${source.title}（副本）` : source.title,
            content: source.content,
            inputs: [...source.inputs],
            estimatedTokens: source.estimatedTokens,
            originalLength: source.originalLength,
          })
          set({
            currentNovel: {
              ...novel,
              artifacts: [...novel.artifacts, copy],
            },
          })
          message.success('已创建副本')
          return copy.id
        } catch (error: any) {
          message.error(error.message || '复制失败')
          return null
        }
      },

      editChapterTitle: async (cid, title) => {
        const novel = get().currentNovel
        if (!novel) return false
        try {
          const chapter = await api.updateChapter(novel.id, cid, title)
          set({
            currentNovel: {
              ...novel,
              chapters: novel.chapters.map((c) => (c.id === cid ? chapter : c)),
            },
          })
          return true
        } catch (error: any) {
          message.error(error.message || '保存失败')
          return false
        }
      },

      removeChapter: async (cid) => {
        const novel = get().currentNovel
        if (!novel) return false
        try {
          await api.deleteChapter(novel.id, cid)
          message.success('已删除')
          await get().fetchNovel(novel.id)
          await get().fetchNovels()
          return true
        } catch (error: any) {
          message.error(error.message || '删除失败')
          return false
        }
      },

      startGeneration: async (req) => {
        if (get().streaming) {
          message.warning('已有生成任务进行中')
          return
        }
        const novel = get().currentNovel
        if (!novel || novel.id !== req.novelId) return
        const controller = new AbortController()
        generationController = controller
        // 章节 id：generate 直接带；revise/continue/rewrite-range 由目标文段归属推出
        const chapterId =
          req.chapterId ??
          novel.artifacts.find((t) => t.id === req.targetId)?.chapterId ??
          null
        set({
          streaming: {
            op: req.op,
            outputType: req.outputType,
            target: streamingTargetOf(req, novel),
            targetId: req.targetId ?? null,
            chapterId,
            text: '',
          },
        })
        try {
          await runGeneration(
            req,
            novel,
            {
              onDelta: (text) =>
                set((s) => ({
                  streaming: s.streaming
                    ? { ...s.streaming, text: s.streaming.text + text }
                    : null,
                })),
              onDone: ({ aborted, summaryError }) => {
                if (aborted) message.info('已中断，已生成的内容已保留')
                if (summaryError) {
                  message.warning(`正文已保存，但摘要生成失败：${summaryError}`)
                }
              },
            },
            controller.signal,
          )
        } catch (error: any) {
          message.error(error.message || '生成失败')
        } finally {
          generationController = null
          set({ streaming: null })
          // 重新拉取落盘结果（done / 出错统一在这里刷新）
          const id = get().currentNovelId
          if (id) await get().fetchNovel(id)
          await get().fetchNovels()
        }
      },

      abortGeneration: async () => {
        generationController?.abort()
      },
    }),
    {
      name: 'novel-store',
      // 只持久化当前书 id；streaming / 模态框 / 书籍数据不持久化
      partialize: (state) => ({
        currentNovelId: state.currentNovelId,
      }),
    },
  ),
)
