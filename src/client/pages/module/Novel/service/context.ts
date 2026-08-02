// 上下文组装：所有生成任务的唯一上下文入口（见 docs/novel/implementation-plan.md 第 4 节）
// （自服务端 module/novel/context 前移；参考文内容改经 CRUD 接口拉取并做内存缓存）
import { getRefContent } from '../api'
import { estimateTokens } from '../shared/tokenEstimate'
import type {
  ChatMessage,
  ContextSelection,
  ContextSnapshot,
  GenerateKind,
  Novel,
  NovelChapter,
} from '../types'
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

// 参考文内容内存缓存（估算防抖期间避免反复拉取大文本）
// 参考文不支持编辑，上传/删除时由 store 调用 clearRefContentCache 失效
const refContentCache = new Map<string, string>()

export const clearRefContentCache = () => refContentCache.clear()

// 批量读取参考文内容（并行 + 缓存），key 为 refId
const getRefContents = async (
  novelId: string,
  refIds: string[],
): Promise<Map<string, string>> => {
  const result = new Map<string, string>()
  await Promise.all(
    refIds.map(async (refId) => {
      const cacheKey = `${novelId}:${refId}`
      let content = refContentCache.get(cacheKey)
      if (content === undefined) {
        try {
          content = (await getRefContent(novelId, refId)).content
        } catch {
          content = ''
        }
        refContentCache.set(cacheKey, content)
      }
      result.set(refId, content)
    }),
  )
  return result
}

// 默认勾选规则（4.1）
export const getDefaultSelection = (
  novel: Novel,
  kind: GenerateKind,
  chapter?: NovelChapter,
): ContextSelection => {
  const empty: ContextSelection = {
    refIds: [],
    settingIds: [],
    fullChapterIds: [],
    summaryChapterIds: [],
  }

  // 摘要、整章微调、选段重写：prompt 自带正文全文，默认不带其他上下文
  if (
    kind === 'summary' ||
    kind === 'revise-content' ||
    kind === 'rewrite-selection'
  ) {
    return empty
  }

  // 生成设定：默认勾选全部参考文
  if (kind === 'setting') {
    return { ...empty, refIds: novel.refs.map((r) => r.id) }
  }

  // 正文/续写：继承本章快照（优先正文快照，其次大纲快照）
  if (kind !== 'outline' && kind !== 'revise-outline' && chapter) {
    const inherited = chapter.contentContext ?? chapter.outlineContext
    if (inherited) {
      return {
        refIds: inherited.refIds,
        settingIds: inherited.settingIds,
        fullChapterIds: inherited.fullChapterIds,
        summaryChapterIds: inherited.summaryChapterIds,
      }
    }
  }

  // 大纲默认：参考文不勾、设定全勾、最近 N 章全文 + 更早章节摘要
  // 没有摘要的章节降级为全文，且不占 N 的名额
  const history = novel.chapters
    .filter((c) => c.id !== chapter?.id && c.content)
    .sort((a, b) => a.index - b.index)
  const n = novel.recentFullChapters
  const fullChapterIds: string[] = []
  const summaryChapterIds: string[] = []
  history.forEach((c, i) => {
    if (i >= history.length - n || !c.summary) {
      fullChapterIds.push(c.id)
    } else {
      summaryChapterIds.push(c.id)
    }
  })
  return {
    refIds: [],
    settingIds: novel.settings.map((s) => s.id),
    fullChapterIds,
    summaryChapterIds,
  }
}

export interface BuildMessagesParams {
  novel: Novel
  kind: GenerateKind
  /** 目标章节（章节类 kind 必传） */
  chapter?: NovelChapter
  /** 勾选快照；缺省时按默认规则计算 */
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
  snapshot: ContextSnapshot
}

// 组装消息（结构见 4.2），并同步算出 estimatedTokens 随快照记录
export const buildMessages = async (
  params: BuildMessagesParams,
): Promise<BuiltContext> => {
  const { novel, kind, chapter } = params
  const selection =
    params.selection ?? getDefaultSelection(novel, kind, chapter)

  const messages: ChatMessage[] = [
    { role: 'system', content: BASE_SYSTEM_PROMPT },
  ]

  // 核心设定（按勾选，逐张拼接）
  const settings = novel.settings.filter((s) =>
    selection.settingIds.includes(s.id),
  )
  if (settings.length > 0) {
    messages.push({ role: 'user', content: formatSettings(settings) })
  }

  // 参考文（按勾选，取存储内容，可能已截断为末尾 50k）
  const refs = novel.refs.filter((r) => selection.refIds.includes(r.id))
  if (refs.length > 0) {
    const contents = await getRefContents(
      novel.id,
      refs.map((r) => r.id),
    )
    const materials = refs.map((r) => ({
      title: r.title,
      content: contents.get(r.id) || '',
    }))
    messages.push({
      role: 'user',
      content: formatRefMaterials(
        materials,
        kind === 'setting' ? '【参考材料】' : '【参考文节选】',
      ),
    })
  }

  // 前情摘要（summaryChapterIds）
  const summaryChapters = selection.summaryChapterIds
    .map((id) => novel.chapters.find((c) => c.id === id))
    .filter((c): c is NovelChapter => !!c && !!c.summary)
    .sort((a, b) => a.index - b.index)
  if (summaryChapters.length > 0) {
    messages.push({ role: 'user', content: formatSummaries(summaryChapters) })
  }

  // 最近章节全文（fullChapterIds）
  const fullChapters = selection.fullChapterIds
    .map((id) => novel.chapters.find((c) => c.id === id))
    .filter((c): c is NovelChapter => !!c && !!c.content)
    .sort((a, b) => a.index - b.index)
  if (fullChapters.length > 0) {
    messages.push({ role: 'user', content: formatFullChapters(fullChapters) })
  }

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
        content: buildOutlineTask(
          chapter?.index ?? novel.chapters.length + 1,
          params.instruction,
        ),
      })
      break
    case 'revise-outline':
      messages.push({
        role: 'user',
        content: buildReviseOutlineTask(
          chapter?.outline,
          params.instruction || '',
        ),
      })
      break
    case 'content':
      if (chapter?.outline) {
        messages.push({ role: 'user', content: formatOutline(chapter.outline) })
      }
      messages.push({
        role: 'user',
        content: buildContentTask(
          chapter?.index ?? 1,
          params.targetLength ?? DEFAULT_TARGET_LENGTH,
          params.instruction,
        ),
      })
      break
    case 'continue-content':
      if (chapter?.outline) {
        messages.push({ role: 'user', content: formatOutline(chapter.outline) })
      }
      messages.push({
        role: 'user',
        content: buildContinueTask(
          chapter?.index ?? 1,
          (chapter?.content || '').slice(-CONTINUE_PREFIX_CHARS),
          params.instruction,
        ),
      })
      break
    case 'rewrite-selection': {
      const content = chapter?.content || ''
      const selected = params.range
        ? content.slice(params.range.start, params.range.end)
        : ''
      messages.push({
        role: 'user',
        content: buildRewriteSelectionTask(
          content,
          selected,
          params.instruction || '',
        ),
      })
      break
    }
    case 'revise-content':
      messages.push({
        role: 'user',
        content: buildReviseContentTask(
          chapter?.content || '',
          params.instruction || '',
        ),
      })
      break
    case 'summary':
      messages.push({
        role: 'user',
        content: buildSummaryTask(chapter?.content || ''),
      })
      break
  }

  const estimatedTokens = messages.reduce(
    (sum, m) => sum + estimateTokens(m.content),
    0,
  )
  return { messages, snapshot: { ...selection, estimatedTokens } }
}
