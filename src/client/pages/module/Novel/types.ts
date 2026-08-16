// 前端复用共享类型
import type {
  ArtifactOperation,
  ArtifactType,
  Novel,
} from '@/shared/novel/types'
export type {
  ArtifactEditOp,
  ArtifactOperation,
  ArtifactPatch,
  ArtifactRevision,
  ArtifactType,
  ChatMessage,
  ContextSelection,
  Novel,
  NovelArtifact,
  NovelChapter,
  NovelIndexItem,
  NovelSummary,
} from '@/shared/novel/types'

// 流式生成在前端的落点（决定 streaming 文本渲染在哪张卡片上）
export type StreamingTarget = 'setting' | 'outline' | 'content' | 'summary'

// 由请求推导流式落点：generate 看产出类型，其余看目标文段类型
export const streamingTargetOf = (
  req: {
    op: ArtifactOperation
    outputType?: ArtifactType
    targetId?: string
  },
  novel: Novel | null,
): StreamingTarget => {
  if (req.op === 'generate') return req.outputType as StreamingTarget
  const target = novel?.artifacts.find((t) => t.id === req.targetId)
  return target?.type === 'outline' ? 'outline' : 'content'
}

// 流式生成会话状态
export interface StreamingState {
  op: ArtifactOperation
  /** 仅 generate：产出类型 */
  outputType?: ArtifactType
  target: StreamingTarget
  /** revise / continue / rewrite-range 的目标文段 id（generate 为 null） */
  targetId: string | null
  /** outline 自动新建章节时为空，生成开始时由 service 创建章节 */
  chapterId: string | null
  text: string
}

// token 数展示：>=1000 显示为 18.2k
export const formatTokens = (n: number): string =>
  n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`

// ---------- NovelArtifact 查询工具 ----------

// 按创建时间排序的章节列表（章节顺序即创建时间顺序）
export const sortedChapters = (novel: Novel): Novel['chapters'] =>
  [...novel.chapters].sort((a, b) => a.createdAt - b.createdAt)

// 章节序号（从 1 开始；不存在返回 0）
export const chapterIndex = (novel: Novel, chapterId: string): number =>
  sortedChapters(novel).findIndex((c) => c.id === chapterId) + 1

// 取某章指定类型的文段（outline/content/summary 每章至多一条，由前端约束）
export const findChapterArtifact = (
  novel: Novel,
  chapterId: string,
  type: ArtifactType,
) => novel.artifacts.find((t) => t.chapterId === chapterId && t.type === type)

// 取某类型的全部文段，按创建时间排序
export const artifactsByType = (novel: Novel, type: ArtifactType) =>
  novel.artifacts
    .filter((t) => t.type === type)
    .sort((a, b) => a.createdAt - b.createdAt)
