// 前端复用服务端类型（见 docs/novel/implementation-plan.md 2.2）
import type { GenerateKind } from '../../../../server/module/novel/types'
export { GENERATE_KINDS } from '../../../../server/module/novel/types'
export type {
  ChatMessage,
  ContextSelection,
  ContextSnapshot,
  GenerateKind,
  Novel,
  NovelChapter,
  NovelChapterStatus,
  NovelIndexItem,
  NovelOutline,
  NovelRef,
  NovelSetting,
} from '../../../../server/module/novel/types'

// 流式生成在前端的落点（决定 streaming 文本渲染在哪张卡片上）
export type StreamingTarget = 'setting' | 'outline' | 'content' | 'summary'

export const kindToTarget = (kind: GenerateKind): StreamingTarget => {
  if (kind === 'setting') return 'setting'
  if (kind === 'outline' || kind === 'revise-outline') return 'outline'
  if (kind === 'summary') return 'summary'
  return 'content'
}

// 流式生成会话状态（见 implementation-plan.md 7.4）
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
