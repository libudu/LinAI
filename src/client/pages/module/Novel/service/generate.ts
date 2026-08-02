// 小说生成编排：kind 前置校验 → 上下文组装 → 流式生成 → 结果落盘（统一文本接口）→ 自动摘要
// 后端只提供统一文本 CRUD 与 /llm 代理，业务编排全部在此
import * as api from '../api'
import type { ContextSelection, Novel, NovelChapter } from '../types'
import { findChapterText, textsByType } from '../types'
import { TEMPERATURES } from './constants'
import { buildMessages } from './context'
import { GenerationError, chatOnce, chatStream } from './llm'
import { buildSummaryMessages } from './prompts'

// 生成请求体（kind 决定必填字段）
export type GenerateRequest =
  | {
      kind: 'setting'
      novelId: string
      instruction: string
      selection?: ContextSelection
    }
  | {
      kind: 'outline'
      novelId: string
      chapterId?: string
      instruction?: string
      selection?: ContextSelection
    }
  | {
      kind: 'revise-outline'
      novelId: string
      chapterId: string
      instruction: string
      selection?: ContextSelection
    }
  | {
      kind: 'content'
      novelId: string
      chapterId: string
      instruction?: string
      selection?: ContextSelection
      targetLength?: number
    }
  | {
      kind: 'continue-content'
      novelId: string
      chapterId: string
      instruction?: string
    }
  | {
      kind: 'rewrite-selection'
      novelId: string
      chapterId: string
      instruction: string
      range: { start: number; end: number }
    }
  | {
      kind: 'revise-content'
      novelId: string
      chapterId: string
      instruction: string
    }
  | { kind: 'summary'; novelId: string; chapterId: string }

export interface GenerateDoneData {
  chapterId?: string
  usage?: unknown
  aborted: boolean
  summaryError?: string
}

export interface GenerateHandlers {
  onDelta?: (text: string) => void
  onDone?: (data: GenerateDoneData) => void
}

interface PersistParams {
  kind: GenerateRequest['kind']
  novel: Novel
  chapter?: NovelChapter
  text: string
  /** 生成时实际使用的勾选（落盘为新文本的 sourceIds） */
  selection: ContextSelection
  estimatedTokens: number
  /** false 表示中途出错或被 abort：仅保存可保留的部分 */
  final: boolean
  range?: { start: number; end: number }
}

interface PersistResult {
  summaryError?: string
}

// 设定卡标题取生成内容首行（去掉 # 标记与冒号后缀），兜底「设定 N」
const deriveSettingTitle = (text: string, count: number): string => {
  const firstLine =
    text
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 0) || ''
  const cleaned = firstLine
    .replace(/^#+\s*/, '')
    .replace(/[：:].*$/, '')
    .trim()
    .slice(0, 30)
  return cleaned || `设定 ${count + 1}`
}

// 生成结果落盘：按 kind 写入设定 / 大纲 / 正文 / 摘要文本（统一 texts 接口）
const persistGeneration = async (
  params: PersistParams,
): Promise<PersistResult> => {
  const { kind, novel, chapter, text, selection, final } = params
  const result: PersistResult = {}
  if (!text.trim()) return result

  if (kind === 'setting') {
    await api.createText(novel.id, {
      type: 'setting',
      title: deriveSettingTitle(text, textsByType(novel, 'setting').length),
      content: text,
      sourceIds: selection.textIds,
      estimatedTokens: params.estimatedTokens,
    })
    return result
  }
  if (!chapter) return result

  if (kind === 'outline' || kind === 'revise-outline') {
    // revise-outline 的部分结果不覆盖原大纲；outline 中断保留部分结果
    if (!final && kind === 'revise-outline') return result
    const existing = findChapterText(novel, chapter.id, 'outline')
    if (existing) {
      await api.updateText(novel.id, existing.id, { content: text })
    } else {
      await api.createText(novel.id, {
        type: 'outline',
        chapterId: chapter.id,
        content: text,
        sourceIds: selection.textIds,
        estimatedTokens: params.estimatedTokens,
      })
    }
    return result
  }

  if (kind === 'summary') {
    if (final) {
      const existing = findChapterText(novel, chapter.id, 'summary')
      if (existing) {
        await api.updateText(novel.id, existing.id, { content: text.trim() })
      } else {
        await api.createText(novel.id, {
          type: 'summary',
          chapterId: chapter.id,
          content: text.trim(),
        })
      }
    }
    return result
  }

  // 正文类：revise/rewrite 的部分结果会覆盖原有内容，仅 final 时落盘
  if (!final && (kind === 'revise-content' || kind === 'rewrite-selection')) {
    return result
  }

  const existing = findChapterText(novel, chapter.id, 'content')
  let content = text
  if (kind === 'continue-content') {
    content = (existing?.content || '') + text
  } else if (kind === 'rewrite-selection' && params.range) {
    content =
      (existing?.content || '').slice(0, params.range.start) +
      text +
      (existing?.content || '').slice(params.range.end)
  }

  // 正文溯源快照 = 本章大纲文本 + 实际勾选
  const outlineId = findChapterText(novel, chapter.id, 'outline')?.id
  const sourceIds = [...(outlineId ? [outlineId] : []), ...selection.textIds]

  let contentTextId: string
  if (existing) {
    // 仅「生成正文」覆盖溯源快照；续写/微调/重写保留原快照
    const updated = await api.updateText(novel.id, existing.id, {
      content,
      ...(kind === 'content' ? { sourceIds } : {}),
    })
    contentTextId = updated.id
  } else {
    const created = await api.createText(novel.id, {
      type: 'content',
      chapterId: chapter.id,
      content,
      sourceIds,
      estimatedTokens: params.estimatedTokens,
    })
    contentTextId = created.id
  }

  // 正文正常完成后自动生成章节摘要；失败不阻塞流程，前端可手动重试
  if (final) {
    try {
      const summary = await chatOnce({
        messages: buildSummaryMessages(content),
        temperature: TEMPERATURES.summary,
      })
      if (summary.trim()) {
        const existingSummary = findChapterText(novel, chapter.id, 'summary')
        if (existingSummary) {
          await api.updateText(novel.id, existingSummary.id, {
            content: summary.trim(),
          })
        } else {
          await api.createText(novel.id, {
            type: 'summary',
            chapterId: chapter.id,
            content: summary.trim(),
            sourceIds: [contentTextId],
          })
        }
      }
    } catch (error: any) {
      console.error('[小说] 自动生成摘要失败:', error)
      result.summaryError = error.message
    }
  }
  return result
}

/**
 * 生成主流程。抛错表示前置失败或上游报错（部分结果已按规则落盘）；
 * 主动 abort 不抛错，onDone 中 aborted: true。
 */
export const runGeneration = async (
  req: GenerateRequest,
  novel: Novel,
  handlers: GenerateHandlers,
  signal: AbortSignal,
): Promise<void> => {
  const kind = req.kind

  // 定位/创建目标章节并做 kind 前置校验
  let chapter: NovelChapter | undefined
  if (kind === 'outline') {
    if (req.chapterId) {
      chapter = novel.chapters.find((ch) => ch.id === req.chapterId)
      if (!chapter) throw new Error('[小说] 章节不存在')
    } else {
      chapter = (await api.createChapter(novel.id)) ?? undefined
      if (!chapter) throw new Error('[小说] 创建章节失败')
    }
  } else if (kind !== 'setting') {
    chapter = novel.chapters.find((ch) => ch.id === req.chapterId)
    if (!chapter) throw new Error('[小说] 章节不存在')
  }

  const outlineText = chapter
    ? findChapterText(novel, chapter.id, 'outline')
    : undefined
  const contentText = chapter
    ? findChapterText(novel, chapter.id, 'content')
    : undefined

  if ((kind === 'revise-outline' || kind === 'content') && !outlineText) {
    throw new Error('[小说] 该章节还没有大纲，请先生成大纲')
  }
  if (
    (kind === 'continue-content' ||
      kind === 'revise-content' ||
      kind === 'summary') &&
    !contentText
  ) {
    throw new Error('[小说] 该章节还没有正文')
  }
  if (kind === 'rewrite-selection') {
    const length = contentText?.content?.length ?? 0
    if (
      !contentText ||
      req.range.start >= req.range.end ||
      req.range.end > length
    ) {
      throw new Error('[小说] 选中区间无效')
    }
  }

  const { messages, selection, estimatedTokens } = buildMessages({
    novel,
    kind,
    chapter,
    selection: 'selection' in req ? req.selection : undefined,
    instruction: 'instruction' in req ? req.instruction : undefined,
    targetLength: kind === 'content' ? req.targetLength : undefined,
    range: kind === 'rewrite-selection' ? req.range : undefined,
  })
  const temperature = TEMPERATURES[kind]

  // 摘要走非流式，全文作为单个 delta 发出
  if (kind === 'summary') {
    const text = await chatOnce({ messages, temperature })
    if (text) handlers.onDelta?.(text)
    const extra = await persistGeneration({
      kind,
      novel,
      chapter,
      text,
      selection,
      estimatedTokens,
      final: true,
    })
    handlers.onDone?.({ chapterId: chapter?.id, aborted: false, ...extra })
    return
  }

  let text: string
  let usage: unknown | null = null
  let aborted = false
  try {
    const res = await chatStream({
      messages,
      temperature,
      signal,
      onDelta: (t) => handlers.onDelta?.(t),
    })
    text = res.text
    usage = res.usage
    aborted = res.aborted
  } catch (error: any) {
    // 上游报错：已生成的部分照常落盘
    const partial = error instanceof GenerationError ? error.partial : ''
    try {
      await persistGeneration({
        kind,
        novel,
        chapter,
        text: partial,
        selection,
        estimatedTokens,
        final: false,
        range: kind === 'rewrite-selection' ? req.range : undefined,
      })
    } catch (e) {
      console.error('[小说] 部分结果落盘失败:', e)
    }
    throw error
  }

  const extra = await persistGeneration({
    kind,
    novel,
    chapter,
    text,
    selection,
    estimatedTokens,
    final: !aborted,
    range: kind === 'rewrite-selection' ? req.range : undefined,
  })
  handlers.onDone?.({
    chapterId: chapter?.id,
    usage: usage ?? undefined,
    aborted,
    ...extra,
  })
}
