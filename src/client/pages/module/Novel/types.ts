// 前端复用共享类型
import type { ArtifactType, Novel } from '@/shared/novel/types'
export type {
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

// 文段操作：纯前端编排概念（GenerateRequest 的 op 字段，不落盘、后端无感知，故不在 shared）。
// 「生成什么」由输出文段类型（outputType）决定，「参考什么」由勾选（selection）决定，
// 两者都不是场景枚举；UI 标题仍说人话（生成大纲/生成正文），底层都是同一套操作。
// 落盘到历史快照的来源枚举（ArtifactRevision.source）是另一个 union，注意不要混用
export type ArtifactOperation =
  | 'generate' // 参考勾选文段生成新文段，产出类型由 outputType 指定
  | 'revise' // 按指令整体修改某文段 → version +1
  | 'continue' // 续写 content 文段（拼接，version +1）
  | 'rewrite-range' // 选段重写（字符区间替换，version +1）

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
