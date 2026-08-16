// 小说生成模块数据类型（前后端共享）
// 前端从 src/client/pages/module/Novel/types.ts re-export 复用
//
// 核心抽象：参考文 / 核心设定 / 章节大纲 / 正文 / 章节摘要 统一为 NovelText，
// 仅靠 type 区分；后端只提供统一的文本 CRUD，业务编排全部在前端 service/ 完成

export type NovelTextType =
  | 'ref'
  | 'setting'
  | 'outline'
  | 'content'
  | 'summary'

// 一段有效文本（内容统一内联存储在 novel.json）
export interface NovelText {
  id: string
  type: NovelTextType
  chapterId?: string // outline/content/summary 归属的章节；ref/setting 无
  title: string // ref/setting 的标题；outline/content/summary 一般为空
  content: string
  // 生成该文本时引用的 NovelText id 列表（生成溯源快照；手动创建为 []）。
  // 引用的文本被删除后 id 仍保留，前端查不到即展示删除线（已删除）
  sourceIds: string[]
  estimatedTokens?: number // 生成时的上下文估算值，仅记录
  originalLength?: number // 仅 ref：截断前原始字符数（> content.length 即已截断）
  createdAt: number
  updatedAt: number
}

// 轻量章节容器：仅作大纲/正文/摘要的分组，无序号，按 createdAt 排序即先后关系
export interface NovelChapter {
  id: string
  title: string // 可空，用户可命名
  createdAt: number
  updatedAt: number
}

export interface Novel {
  id: string
  title: string
  chapters: NovelChapter[] // 按 createdAt 排序即章节顺序
  texts: NovelText[]
  recentFullChapters: number // N：默认携带最近几章全文，默认 3
  createdAt: number
  updatedAt: number
}

// 上下文勾选：生成请求与估算接口的入参，与生成的文本落盘的 sourceIds 同构。
// 全文/摘要的携带方式由 id 天然编码：勾选「全文」即引用该章 content 文本 id，
// 勾选「摘要」即引用该章 summary 文本 id
export interface ContextSelection {
  textIds: string[]
}

// data/novels/index.json 中的书籍索引项
export interface NovelIndexItem {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  chapterCount: number
}

// EntityStore('novel.books') 的摘要：书籍列表所需信息，写入时由业务方提供
export interface NovelSummary {
  title: string
  chapterCount: number
}

// 生成任务类型
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
