import { message } from 'antd'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import * as api from './api'
import { clearRefContentCache } from './service/context'
import { REF_MAX_CHARS, REF_TOTAL_MAX_CHARS } from './service/constants'
import { runGeneration, type GenerateRequest } from './service/generate'
import type {
  Novel,
  NovelChapter,
  NovelIndexItem,
  StreamingState,
} from './types'
import { kindToTarget } from './types'

// 当前生成任务的中断控制器（单页单任务，由 streaming 状态保证互斥）
let generationController: AbortController | null = null

// 上下文选择抽屉的打开意图（正文入口的默认勾选从 outlineContext 快照还原，由抽屉组件计算）
export interface DrawerRequest {
  kind: 'setting' | 'outline' | 'content'
  chapterId?: string
}

interface NovelStore {
  // 书籍索引与当前书
  novels: NovelIndexItem[]
  currentNovelId: string | null
  currentNovel: Novel | null
  loadingNovels: boolean
  loadingNovel: boolean

  // 卡片折叠态（key：outline:<cid> / content:<cid> / setting:<sid>），跨会话持久化
  collapsed: Record<string, boolean>
  toggleCollapsed: (key: string) => void

  // 流式生成状态（见 implementation-plan.md 7.4）
  streaming: StreamingState | null
  /** 上下文抽屉 */
  drawer: DrawerRequest | null
  openDrawer: (req: DrawerRequest) => void
  closeDrawer: () => void

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

  // 参考文
  uploadRef: (title: string, content: string) => Promise<boolean>
  removeRef: (refId: string) => Promise<boolean>
  fetchRefContent: (refId: string) => Promise<string | null>

  // 核心设定
  createSetting: (title: string, content: string) => Promise<boolean>
  editSetting: (
    sid: string,
    patch: { title?: string; content?: string },
  ) => Promise<boolean>
  removeSetting: (sid: string) => Promise<boolean>

  // 章节
  editChapter: (
    cid: string,
    patch: {
      title?: string
      outline?: NovelChapter['outline']
      content?: string
      summary?: string
    },
  ) => Promise<boolean>
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
      collapsed: {},
      streaming: null,
      drawer: null,

      toggleCollapsed: (key) =>
        set((s) => ({
          collapsed: { ...s.collapsed, [key]: !s.collapsed[key] },
        })),

      openDrawer: (req) => set({ drawer: req }),
      closeDrawer: () => set({ drawer: null }),

      fetchNovels: async () => {
        set({ loadingNovels: true })
        try {
          const novels = await api.listNovels()
          set({ novels })
          // 持久化的当前书已被删除时回退到列表第一本
          const { currentNovelId } = get()
          if (currentNovelId && !novels.some((n) => n.id === currentNovelId)) {
            set({ currentNovelId: novels[0]?.id ?? null, currentNovel: null })
          } else if (!currentNovelId && novels.length > 0) {
            set({ currentNovelId: novels[0].id })
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

      uploadRef: async (title, content) => {
        const novel = get().currentNovel
        if (!novel) return false
        // 前端截取：超过单篇上限只保留末尾；全书总量超限直接拒绝
        const stored =
          content.length > REF_MAX_CHARS
            ? content.slice(-REF_MAX_CHARS)
            : content
        const currentTotal = novel.refs.reduce(
          (sum, r) => sum + r.storedLength,
          0,
        )
        if (currentTotal + stored.length > REF_TOTAL_MAX_CHARS) {
          message.error(
            `[小说] 参考文总量超限：已累计 ${currentTotal.toLocaleString()} 字，本次 ${stored.length.toLocaleString()} 字，上限 ${REF_TOTAL_MAX_CHARS.toLocaleString()} 字`,
          )
          return false
        }
        try {
          const ref = await api.addRef(novel.id, title, stored, content.length)
          clearRefContentCache()
          set({ currentNovel: { ...novel, refs: [...novel.refs, ref] } })
          message.success(
            ref.truncated
              ? `已上传（超长已截断：原 ${ref.originalLength.toLocaleString()} 字 → 取末尾 ${ref.storedLength.toLocaleString()} 字）`
              : '已上传',
          )
          return true
        } catch (error: any) {
          message.error(error.message || '上传失败')
          return false
        }
      },

      removeRef: async (refId) => {
        const novel = get().currentNovel
        if (!novel) return false
        try {
          await api.deleteRef(novel.id, refId)
          clearRefContentCache()
          set({
            currentNovel: {
              ...novel,
              refs: novel.refs.filter((r) => r.id !== refId),
            },
          })
          message.success('已删除')
          return true
        } catch (error: any) {
          message.error(error.message || '删除失败')
          return false
        }
      },

      fetchRefContent: async (refId) => {
        const novel = get().currentNovel
        if (!novel) return null
        try {
          const { content } = await api.getRefContent(novel.id, refId)
          return content
        } catch (error: any) {
          message.error(error.message || '获取参考文内容失败')
          return null
        }
      },

      createSetting: async (title, content) => {
        const novel = get().currentNovel
        if (!novel) return false
        try {
          const setting = await api.addSetting(novel.id, title, content)
          set({
            currentNovel: { ...novel, settings: [...novel.settings, setting] },
          })
          message.success('已新增')
          return true
        } catch (error: any) {
          message.error(error.message || '新增失败')
          return false
        }
      },

      editSetting: async (sid, patch) => {
        const novel = get().currentNovel
        if (!novel) return false
        try {
          const setting = await api.updateSetting(novel.id, sid, patch)
          set({
            currentNovel: {
              ...novel,
              settings: novel.settings.map((s) => (s.id === sid ? setting : s)),
            },
          })
          return true
        } catch (error: any) {
          message.error(error.message || '保存失败')
          return false
        }
      },

      removeSetting: async (sid) => {
        const novel = get().currentNovel
        if (!novel) return false
        try {
          await api.deleteSetting(novel.id, sid)
          set({
            currentNovel: {
              ...novel,
              settings: novel.settings.filter((s) => s.id !== sid),
            },
          })
          message.success('已删除')
          return true
        } catch (error: any) {
          message.error(error.message || '删除失败')
          return false
        }
      },

      editChapter: async (cid, patch) => {
        const novel = get().currentNovel
        if (!novel) return false
        try {
          const chapter = await api.updateChapter(novel.id, cid, patch)
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
        const chapterId = 'chapterId' in req ? (req.chapterId ?? null) : null
        set({
          streaming: {
            kind: req.kind,
            target: kindToTarget(req.kind),
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
      // 只持久化当前书 id 与卡片折叠态；streaming / 书籍数据不持久化
      partialize: (state) => ({
        currentNovelId: state.currentNovelId,
        collapsed: state.collapsed,
      }),
    },
  ),
)
