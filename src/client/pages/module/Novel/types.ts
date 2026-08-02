// 前端复用服务端类型
import type { GenerateKind } from '../../../../server/module/novel/types'
export { GENERATE_KINDS } from '../../../../server/module/novel/types'
export type {
  ChatMessage,
  ContextSelection,
  GenerateKind,
  Novel,
  NovelChapter,
  NovelIndexItem,
  NovelText,
  NovelTextType,
} from '../../../../server/module/novel/types'
import type { Novel, NovelText, NovelTextType } from './types'

// 流式生成在前端的落点（决定 streaming 文本渲染在哪张卡片上）
export type StreamingTarget = 'setting' | 'outline' | 'content' | 'summary'

export const kindToTarget = (kind: GenerateKind): StreamingTarget => {
  if (kind === 'setting') return 'setting'
  if (kind === 'outline' || kind === 'revise-outline') return 'outline'
  if (kind === 'summary') return 'summary'
  return 'content'
}

// 流式生成会话状态
export interface StreamingState {
  kind: GenerateKind
  target: StreamingTarget
  /** outline 自动新建章节时为空，生成开始时由 service 创建章节 */
  chapterId: string | null
  text: string
}

// token 数展示：>=1000 显示为 18.2k
export const formatTokens = (n: number): string =>
  n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`

// ---------- NovelText 查询工具 ----------

// 按创建时间排序的章节列表（章节顺序即创建时间顺序）
export const sortedChapters = (novel: Novel): Novel['chapters'] =>
  [...novel.chapters].sort((a, b) => a.createdAt - b.createdAt)

// 章节序号（从 1 开始；不存在返回 0）
export const chapterIndex = (novel: Novel, chapterId: string): number =>
  sortedChapters(novel).findIndex((c) => c.id === chapterId) + 1

// 取某章指定类型的文本（outline/content/summary 每章至多一条，由前端约束）
export const findChapterText = (
  novel: Novel,
  chapterId: string,
  type: NovelTextType,
): NovelText | undefined =>
  novel.texts.find((t) => t.chapterId === chapterId && t.type === type)

// 取某类型的全部文本，按创建时间排序
export const textsByType = (
  novel: Novel,
  type: NovelTextType,
): NovelText[] =>
  novel.texts
    .filter((t) => t.type === type)
    .sort((a, b) => a.createdAt - b.createdAt)
