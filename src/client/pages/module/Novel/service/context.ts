// 上下文组装：所有生成任务的唯一上下文入口
// 所有文本（参考文/设定/大纲/正文/摘要）统一为 NovelText 内联在 novel.texts 中，
// 勾选与快照都是扁平的 textIds 列表；全文/摘要的携带方式由 id 天然编码
import { estimateTokens } from '../shared/tokenEstimate'
import type {
  ChatMessage,
  ContextSelection,
  GenerateKind,
  Novel,
  NovelChapter,
} from '../types'
import { chapterIndex, findChapterText, textsByType } from '../types'
import { CONTINUE_PREFIX_CHARS, DEFAULT_TARGET_LENGTH } from './constants'
import {
  BASE_SYSTEM_PROMPT,
  buildContentTask,
  buildContinueTask,
  buildOutlineTask,
  buildReviseContentTask,
  buildReviseOutlineTask,
  buildRewriteSelectionTask,
  buildSettingTask,
  buildSummaryTask,
  formatFullChapters,
  formatOutline,
  formatRefMaterials,
  formatSettings,
  formatSummaries,
} from './prompts'

// 默认勾选规则：
// - 摘要、整章微调、选段重写：prompt 自带正文全文，默认不带其他上下文
// - 生成设定：默认勾选全部参考文
// - 正文/续写：继承本章大纲文本的 sourceIds
// - 大纲：设定全勾、最近 N 章全文 + 更早章节摘要（无摘要的降级为全文，且不占 N 的名额）
export const getDefaultSelection = (
  novel: Novel,
  kind: GenerateKind,
  chapter?: NovelChapter,
): ContextSelection => {
  const empty: ContextSelection = { textIds: [] }

  if (
    kind === 'summary' ||
    kind === 'revise-content' ||
    kind === 'rewrite-selection'
  ) {
    return empty
  }

  if (kind === 'setting') {
    return { textIds: textsByType(novel, 'ref').map((t) => t.id) }
  }

  if (kind !== 'outline' && kind !== 'revise-outline' && chapter) {
    const outline = findChapterText(novel, chapter.id, 'outline')
    if (outline && outline.sourceIds.length > 0) {
      return { textIds: [...outline.sourceIds] }
    }
  }

  const textIds: string[] = textsByType(novel, 'setting').map((t) => t.id)
  const history = [...novel.chapters]
    .filter((c) => c.id !== chapter?.id)
    .sort((a, b) => a.createdAt - b.createdAt)
  const n = novel.recentFullChapters
  history.forEach((c, i) => {
    const content = findChapterText(novel, c.id, 'content')
    if (!content) return
    const summary = findChapterText(novel, c.id, 'summary')
    if (i >= history.length - n || !summary) {
      textIds.push(content.id)
    } else {
      textIds.push(summary.id)
    }
  })
  return { textIds }
}

export interface BuildMessagesParams {
  novel: Novel
  kind: GenerateKind
  /** 目标章节（章节类 kind 必传） */
  chapter?: NovelChapter
  /** 勾选；缺省时按默认规则计算 */
  selection?: ContextSelection
  /** 用户附加要求 / 修改指令 */
  instruction?: string
  /** 正文目标篇幅，默认 3000 */
  targetLength?: number
  /** rewrite-selection：选中区间（正文字符偏移） */
  range?: { start: number; end: number }
}

export interface BuiltContext {
  messages: ChatMessage[]
  /** 实际使用的勾选（落盘为生成文本的 sourceIds） */
  selection: ContextSelection
  estimatedTokens: number
}

// 组装消息，并同步算出 estimatedTokens 随生成文本记录
export const buildMessages = (params: BuildMessagesParams): BuiltContext => {
  const { novel, kind, chapter } = params
  const selection =
    params.selection ?? getDefaultSelection(novel, kind, chapter)

  // 按勾选取出文本并按类型分组
  const selected = selection.textIds
    .map((id) => novel.texts.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => !!t)
  const byType = (type: (typeof selected)[number]['type']) =>
    selected
      .filter((t) => t.type === type)
      .sort((a, b) => a.createdAt - b.createdAt)
  const settings = byType('setting')
  const refs = byType('ref')
  // 章节类文本按章节顺序排序
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
        kind === 'setting' ? '【参考材料】' : '【参考文节选】',
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

  // 本章的大纲/正文文本（章节类 kind 使用）
  const outlineText = chapter
    ? findChapterText(novel, chapter.id, 'outline')
    : undefined
  const contentText = chapter
    ? findChapterText(novel, chapter.id, 'content')
    : undefined
  const index = chapter
    ? chapterIndex(novel, chapter.id)
    : novel.chapters.length + 1

  // 各 kind 的大纲段与任务段
  switch (kind) {
    case 'setting':
      messages.push({
        role: 'user',
        content: buildSettingTask(params.instruction || '', refs.length > 0),
      })
      break
    case 'outline':
      messages.push({
        role: 'user',
        content: buildOutlineTask(index, params.instruction),
      })
      break
    case 'revise-outline':
      messages.push({
        role: 'user',
        content: buildReviseOutlineTask(
          outlineText?.content ?? '',
          params.instruction || '',
        ),
      })
      break
    case 'content':
      if (outlineText) {
        messages.push({
          role: 'user',
          content: formatOutline(outlineText.content),
        })
      }
      messages.push({
        role: 'user',
        content: buildContentTask(
          index,
          params.targetLength ?? DEFAULT_TARGET_LENGTH,
          params.instruction,
        ),
      })
      break
    case 'continue-content':
      if (outlineText) {
        messages.push({
          role: 'user',
          content: formatOutline(outlineText.content),
        })
      }
      messages.push({
        role: 'user',
        content: buildContinueTask(
          index,
          (contentText?.content || '').slice(-CONTINUE_PREFIX_CHARS),
          params.instruction,
        ),
      })
      break
    case 'rewrite-selection': {
      const content = contentText?.content || ''
      const selectedRange = params.range
        ? content.slice(params.range.start, params.range.end)
        : ''
      messages.push({
        role: 'user',
        content: buildRewriteSelectionTask(
          content,
          selectedRange,
          params.instruction || '',
        ),
      })
      break
    }
    case 'revise-content':
      messages.push({
        role: 'user',
        content: buildReviseContentTask(
          contentText?.content || '',
          params.instruction || '',
        ),
      })
      break
    case 'summary':
      messages.push({
        role: 'user',
        content: buildSummaryTask(contentText?.content || ''),
      })
      break
  }

  const estimatedTokens = messages.reduce(
    (sum, m) => sum + estimateTokens(m.content),
    0,
  )
  return { messages, selection, estimatedTokens }
}
