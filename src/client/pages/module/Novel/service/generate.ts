// 小说生成编排：kind 前置校验 → 上下文组装 → 流式生成 → 大纲解析/修复 → 结果落盘 → 自动摘要
// （原服务端 api/novel.ts /generate 的逻辑整体前移至此，后端只保留 CRUD 与 /llm 代理）
import * as api from '../api'
import type {
  ChatMessage,
  ContextSelection,
  ContextSnapshot,
  Novel,
  NovelChapter,
  NovelOutline,
} from '../types'
import { TEMPERATURES } from './constants'
import { buildMessages } from './context'
import { GenerationError, chatOnce, chatStream } from './llm'
import { buildOutlineRepairMessages, parseOutline } from './prompts'

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
  settingId?: string
  summary?: string
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
  snapshot: ContextSnapshot
  /** false 表示中途出错或被 abort：仅保存可保留的部分，不推进章节状态 */
  final: boolean
  /** outline 类 kind 已解析好的大纲（仅 final 时才解析） */
  outline?: NovelOutline
  range?: { start: number; end: number }
}

interface PersistResult {
  chapterId?: string
  settingId?: string
  summary?: string
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

// 生成结果落盘：按 kind 写入设定卡 / 章节大纲 / 章节正文 / 摘要
const persistGeneration = async (
  params: PersistParams,
): Promise<PersistResult> => {
  const { kind, novel, chapter, text, snapshot, final } = params
  const result: PersistResult = { chapterId: chapter?.id }
  if (!text.trim()) return result

  if (kind === 'setting') {
    const setting = await api.addSetting(
      novel.id,
      deriveSettingTitle(text, novel.settings.length),
      text,
    )
    result.settingId = setting?.id
    return result
  }
  if (!chapter) return result

  if (kind === 'outline' || kind === 'revise-outline') {
    // revise-outline 的部分结果不覆盖原大纲；outline 兜底把原文存入 beats 供手动修改
    if (!final && kind === 'revise-outline') return result
    const outline = params.outline ?? { beats: [text] }
    await api.updateChapter(novel.id, chapter.id, {
      outline,
      ...(kind === 'outline' ? { outlineContext: snapshot } : {}),
      status: final ? 'outlined' : 'outlining',
    })
    return result
  }

  if (kind === 'summary') {
    if (final) {
      await api.updateChapter(novel.id, chapter.id, {
        summary: text.trim(),
        status: 'summarized',
      })
      result.summary = text.trim()
    }
    return result
  }

  // 正文类：revise/rewrite 的部分结果会覆盖原有内容，仅 final 时落盘
  if (!final && (kind === 'revise-content' || kind === 'rewrite-selection')) {
    return result
  }

  let content = text
  if (kind === 'continue-content') {
    content = (chapter.content || '') + text
  } else if (kind === 'rewrite-selection' && params.range) {
    content =
      chapter.content.slice(0, params.range.start) +
      text +
      chapter.content.slice(params.range.end)
  }
  await api.updateChapter(novel.id, chapter.id, {
    content,
    ...(kind === 'content' ? { contentContext: snapshot } : {}),
    status: final ? 'written' : 'writing',
  })

  // 正文正常完成后自动生成章节摘要；失败不阻塞流程，章节停在 written，前端可重试
  if (final) {
    try {
      const { messages } = await buildMessages({
        novel,
        kind: 'summary',
        chapter: { ...chapter, content },
      })
      const summary = await chatOnce({
        messages,
        temperature: TEMPERATURES.summary,
      })
      if (summary.trim()) {
        await api.updateChapter(novel.id, chapter.id, {
          summary: summary.trim(),
          status: 'summarized',
        })
        result.summary = summary.trim()
      }
    } catch (error: any) {
      console.error('[小说] 自动生成摘要失败:', error)
      result.summaryError = error.message
    }
  }
  return result
}

// 大纲 JSON 解析：失败自动修复重试一次，再失败把原文存入 beats 供用户手动修
const resolveOutline = async (
  messages: ChatMessage[],
  text: string,
): Promise<NovelOutline | undefined> => {
  if (!text.trim()) return undefined
  try {
    return parseOutline(text)
  } catch {
    try {
      const fixed = await chatOnce({
        messages: buildOutlineRepairMessages(messages, text),
        temperature: TEMPERATURES.outline,
      })
      return parseOutline(fixed)
    } catch {
      return { beats: [text] }
    }
  }
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

  if ((kind === 'revise-outline' || kind === 'content') && !chapter?.outline) {
    throw new Error('[小说] 该章节还没有大纲，请先生成大纲')
  }
  if (
    (kind === 'continue-content' ||
      kind === 'revise-content' ||
      kind === 'summary') &&
    !chapter?.content
  ) {
    throw new Error('[小说] 该章节还没有正文')
  }
  if (kind === 'rewrite-selection') {
    const length = chapter?.content?.length ?? 0
    if (
      !chapter?.content ||
      req.range.start >= req.range.end ||
      req.range.end > length
    ) {
      throw new Error('[小说] 选中区间无效')
    }
  }

  const { messages, snapshot } = await buildMessages({
    novel,
    kind,
    chapter,
    selection: 'selection' in req ? req.selection : undefined,
    instruction: 'instruction' in req ? req.instruction : undefined,
    targetLength: kind === 'content' ? req.targetLength : undefined,
    range: kind === 'rewrite-selection' ? req.range : undefined,
  })
  const temperature = TEMPERATURES[kind]

  // 推进章节状态（中止/出错时停留在此状态作为标记）
  if (chapter) {
    if (kind === 'outline' || kind === 'revise-outline') {
      await api.updateChapter(novel.id, chapter.id, { status: 'outlining' })
    } else if (kind !== 'summary') {
      await api.updateChapter(novel.id, chapter.id, { status: 'writing' })
    }
  }

  // 摘要走非流式，全文作为单个 delta 发出
  if (kind === 'summary') {
    const text = await chatOnce({ messages, temperature })
    if (text) handlers.onDelta?.(text)
    const extra = await persistGeneration({
      kind,
      novel,
      chapter,
      text,
      snapshot,
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
    // 上游报错：已生成的部分照常落盘（章节状态停留为标记）
    const partial = error instanceof GenerationError ? error.partial : ''
    try {
      await persistGeneration({
        kind,
        novel,
        chapter,
        text: partial,
        snapshot,
        final: false,
        range: kind === 'rewrite-selection' ? req.range : undefined,
      })
    } catch (e) {
      console.error('[小说] 部分结果落盘失败:', e)
    }
    throw error
  }

  // 大纲类先解析 JSON（失败自动修复重试一次）
  const outline =
    !aborted && (kind === 'outline' || kind === 'revise-outline')
      ? await resolveOutline(messages, text)
      : undefined

  const extra = await persistGeneration({
    kind,
    novel,
    chapter,
    text,
    snapshot,
    final: !aborted,
    outline,
    range: kind === 'rewrite-selection' ? req.range : undefined,
  })
  handlers.onDone?.({
    chapterId: chapter?.id,
    usage: usage ?? undefined,
    aborted,
    ...extra,
  })
}
