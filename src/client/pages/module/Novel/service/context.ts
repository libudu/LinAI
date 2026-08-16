// 上下文组装：所有生成任务的唯一上下文入口
// 所有文段（参考文/设定/大纲/正文/摘要）统一为 NovelArtifact 内联在 novel.artifacts 中，
// 勾选与快照都是扁平的 artifactIds 列表；全文/摘要的携带方式由 id 天然编码
import { estimateTokens } from '../shared/tokenEstimate'
import type {
  ArtifactOperation,
  ArtifactType,
  ChatMessage,
  ContextSelection,
  Novel,
  NovelArtifact,
  NovelChapter,
} from '../types'
import { artifactsByType, chapterIndex, findChapterArtifact } from '../types'
import { CONTINUE_PREFIX_CHARS, DEFAULT_TARGET_LENGTH } from './constants'
import {
  BASE_SYSTEM_PROMPT,
  buildContinueTask,
  buildGenerateTask,
  buildReviseTask,
  buildRewriteRangeTask,
  formatFullChapters,
  formatOutline,
  formatRefMaterials,
  formatSettings,
  formatSummaries,
} from './prompts'

export interface DefaultSelectionOpts {
  /** 仅 generate：产出类型 */
  outputType?: ArtifactType
  /** 目标章节（章节类操作）；revise/continue/rewrite-range 缺省时由 target 推出 */
  chapter?: NovelChapter
  /** revise / continue / rewrite-range 的目标文段 */
  target?: NovelArtifact
}

// 默认勾选规则：
// - 选段重写、摘要、正文整体修改：prompt 自带正文全文，默认不带其他上下文
// - 生成设定：默认勾选全部参考文
// - 续写：沿用本章大纲文段的 inputs（无则按大纲默认）
// - 生成正文：设定全勾 + 之前所有章的正文 + 本章大纲；
//   recentFullChapters 仅作上限保护——历史正文超出 N 章时更早章节自动改挂摘要（无摘要降级全文）
// - 生成大纲 / 大纲整体修改：设定全勾 + 历史章正文（同样按 N 上限保护改挂摘要）
export const getDefaultSelection = (
  novel: Novel,
  op: ArtifactOperation,
  opts: DefaultSelectionOpts = {},
): ContextSelection => {
  const empty: ContextSelection = { artifactIds: [] }
  const chapter =
    opts.chapter ??
    (opts.target?.chapterId
      ? novel.chapters.find((c) => c.id === opts.target!.chapterId)
      : undefined)

  if (op === 'rewrite-range') return empty
  if (op === 'generate' && opts.outputType === 'summary') return empty
  // 正文整体修改：prompt 自带全文；大纲整体修改走下方大纲默认
  if (op === 'revise' && opts.target?.type !== 'outline') return empty

  if (op === 'generate' && opts.outputType === 'setting') {
    return { artifactIds: artifactsByType(novel, 'ref').map((t) => t.id) }
  }

  // 续写：沿用本章大纲文段的 inputs
  if (op === 'continue' && chapter) {
    const outline = findChapterArtifact(novel, chapter.id, 'outline')
    if (outline && outline.inputs.length > 0) {
      return { artifactIds: [...outline.inputs] }
    }
  }

  const artifactIds: string[] = artifactsByType(novel, 'setting').map(
    (t) => t.id,
  )
  const history = [...novel.chapters]
    .filter((c) => c.id !== chapter?.id)
    .sort((a, b) => a.createdAt - b.createdAt)
  const n = novel.recentFullChapters
  history.forEach((c, i) => {
    const content = findChapterArtifact(novel, c.id, 'content')
    if (!content) return
    const summary = findChapterArtifact(novel, c.id, 'summary')
    if (i >= history.length - n || !summary) {
      artifactIds.push(content.id)
    } else {
      artifactIds.push(summary.id)
    }
  })
  // 生成正文：再勾上本章大纲
  if (op === 'generate' && opts.outputType === 'content' && chapter) {
    const outline = findChapterArtifact(novel, chapter.id, 'outline')
    if (outline) artifactIds.push(outline.id)
  }
  return { artifactIds }
}

export interface BuildMessagesParams extends DefaultSelectionOpts {
  novel: Novel
  op: ArtifactOperation
  /** 勾选；缺省时按默认规则计算 */
  selection?: ContextSelection
  /** 用户附加要求 / 修改指令 */
  instruction?: string
  /** 正文目标篇幅，默认 3000 */
  targetLength?: number
  /** rewrite-range：选中区间（正文字符偏移） */
  range?: { start: number; end: number }
}

export interface BuiltContext {
  messages: ChatMessage[]
  /** 实际使用的勾选（落盘为生成文段的 inputs） */
  selection: ContextSelection
  estimatedTokens: number
}

// 组装消息，并同步算出 estimatedTokens 随生成文段记录。
// 沙箱规则（写死在代码里，不靠 prompt 自觉）：任何上下文组装一律不读任何文段的
// messages——对话只服务该节点自身的修改，文段内容才是唯一向下游传递的产物
export const buildMessages = (params: BuildMessagesParams): BuiltContext => {
  const { novel, op, chapter } = params
  const selection = params.selection ?? getDefaultSelection(novel, op, params)

  // 按勾选取出文段并按类型分组
  const selected = selection.artifactIds
    .map((id) => novel.artifacts.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => !!t)
  const byType = (type: (typeof selected)[number]['type']) =>
    selected
      .filter((t) => t.type === type)
      .sort((a, b) => a.createdAt - b.createdAt)
  const settings = byType('setting')
  const refs = byType('ref')
  // 章节类文段按章节顺序排序
  const byChapterOrder = (
    a: (typeof selected)[number],
    b: (typeof selected)[number],
  ) => chapterIndex(novel, a.chapterId!) - chapterIndex(novel, b.chapterId!)
  const summaries = byType('summary').sort(byChapterOrder)
  const fullContents = byType('content').sort(byChapterOrder)

  const messages: ChatMessage[] = [
    { role: 'system', content: BASE_SYSTEM_PROMPT },
  ]

  if (settings.length > 0) {
    messages.push({ role: 'user', content: formatSettings(settings) })
  }
  if (refs.length > 0) {
    messages.push({
      role: 'user',
      content: formatRefMaterials(
        refs,
        op === 'generate' && params.outputType === 'setting'
          ? '【参考材料】'
          : '【参考文节选】',
      ),
    })
  }
  if (summaries.length > 0) {
    messages.push({
      role: 'user',
      content: formatSummaries(
        summaries.map((t) => ({
          index: chapterIndex(novel, t.chapterId!),
          content: t.content,
        })),
      ),
    })
  }
  if (fullContents.length > 0) {
    messages.push({
      role: 'user',
      content: formatFullChapters(
        fullContents.map((t) => ({
          index: chapterIndex(novel, t.chapterId!),
          title: t.chapterId
            ? (novel.chapters.find((c) => c.id === t.chapterId)?.title ?? '')
            : '',
          content: t.content,
        })),
      ),
    })
  }

  // 本章的大纲/正文文段（章节类操作使用）
  const outlineArtifact = chapter
    ? findChapterArtifact(novel, chapter.id, 'outline')
    : undefined
  const contentArtifact = chapter
    ? findChapterArtifact(novel, chapter.id, 'content')
    : undefined
  const index = chapter
    ? chapterIndex(novel, chapter.id)
    : novel.chapters.length + 1

  // 各操作的大纲段与任务段（4 种操作，generate 内部按产出类型分派）
  switch (op) {
    case 'generate':
      switch (params.outputType) {
        case 'setting':
          messages.push({
            role: 'user',
            content: buildGenerateTask('setting', {
              instruction: params.instruction,
              hasRefs: refs.length > 0,
            }),
          })
          break
        case 'outline':
          messages.push({
            role: 'user',
            content: buildGenerateTask('outline', {
              index,
              instruction: params.instruction,
            }),
          })
          break
        case 'content':
          if (outlineArtifact) {
            messages.push({
              role: 'user',
              content: formatOutline(outlineArtifact.content),
            })
          }
          messages.push({
            role: 'user',
            content: buildGenerateTask('content', {
              index,
              targetLength: params.targetLength ?? DEFAULT_TARGET_LENGTH,
              instruction: params.instruction,
            }),
          })
          break
        case 'summary':
          messages.push({
            role: 'user',
            content: `【章节正文】\n${contentArtifact?.content || ''}\n\n${buildGenerateTask('summary')}`,
          })
          break
      }
      break
    case 'revise':
      if (params.target) {
        messages.push({
          role: 'user',
          content: buildReviseTask(
            params.target.type,
            params.target.content,
            params.instruction || '',
          ),
        })
      }
      break
    case 'continue':
      if (outlineArtifact) {
        messages.push({
          role: 'user',
          content: formatOutline(outlineArtifact.content),
        })
      }
      messages.push({
        role: 'user',
        content: buildContinueTask(
          index,
          (params.target?.content || '').slice(-CONTINUE_PREFIX_CHARS),
          params.instruction,
        ),
      })
      break
    case 'rewrite-range': {
      const content = params.target?.content || ''
      const selectedRange = params.range
        ? content.slice(params.range.start, params.range.end)
        : ''
      messages.push({
        role: 'user',
        content: buildRewriteRangeTask(
          content,
          selectedRange,
          params.instruction || '',
        ),
      })
      break
    }
  }

  const estimatedTokens = messages.reduce(
    (sum, m) => sum + estimateTokens(m.content),
    0,
  )
  return { messages, selection, estimatedTokens }
}
