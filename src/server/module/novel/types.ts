// 小说生成模块数据类型（见 docs/novel/implementation-plan.md 2.2）
// 前端从本文件导入复用（src/client/pages/module/Novel/types.ts re-export）

// 参考文元数据（内容存 refs/<id>.txt）
export interface NovelRef {
  id: string
  title: string
  fileName: string // refs/ 下的文件名
  originalLength: number // 上传时的原始字符数
  storedLength: number // 截断后实际存储的字符数
  truncated: boolean // originalLength > storedLength，UI 据此显示截断提示
  createdAt: number
}

// 核心设定卡片
export interface NovelSetting {
  id: string
  title: string // 如「世界观」「角色：xx」，用户可改
  content: string
  createdAt: number
}

// 章节大纲（结构化但字段都可为空）
export interface NovelOutline {
  beats: string[] // 有序节拍列表，每条一句话，用户可增删改调序
  tone?: string // 本章目标/基调
  taboos?: string // 禁止事项（负面约束）
}

// 生成某章时实际使用的上下文快照（用于「继承勾选」和溯源展示）
export interface ContextSnapshot {
  refIds: string[]
  settingIds: string[]
  fullChapterIds: string[] // 以全文形式携带的章节
  summaryChapterIds: string[] // 以摘要形式携带的章节
  estimatedTokens: number // 生成时的估算值，仅记录
}

// 上下文勾选（快照去掉估算值），生成请求与估算接口的入参
export type ContextSelection = Omit<ContextSnapshot, 'estimatedTokens'>

export type NovelChapterStatus =
  | 'outlining'
  | 'outlined'
  | 'writing'
  | 'written'
  | 'summarized'

export interface NovelChapter {
  id: string
  index: number // 第几章，从 1 开始
  title: string // 可空，用户可命名
  outline: NovelOutline | null
  outlineContext: ContextSnapshot | null // 生成大纲时的勾选快照
  content: string // 正文，空串表示未生成
  contentContext: ContextSnapshot | null
  summary: string // 章节摘要，正文确认后自动生成，用户可改
  status: NovelChapterStatus
  createdAt: number
  updatedAt: number
}

export interface Novel {
  id: string
  title: string
  refs: NovelRef[]
  settings: NovelSetting[]
  chapters: NovelChapter[]
  recentFullChapters: number // N：默认携带最近几章全文，默认 3
  createdAt: number
  updatedAt: number
}

// data/novels/index.json 中的书籍索引项
export interface NovelIndexItem {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  chapterCount: number
}

// 生成任务类型（见 docs/novel/implementation-plan.md 3.3）
export const GENERATE_KINDS = [
  'setting',
  'outline',
  'revise-outline',
  'content',
  'continue-content',
  'rewrite-selection',
  'revise-content',
  'summary',
] as const
export type GenerateKind = (typeof GENERATE_KINDS)[number]

// 上下文组装产出的消息（OpenAI 兼容接口的 system/user/assistant 文本消息）
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}
