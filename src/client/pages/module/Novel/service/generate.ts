// 小说生成编排：操作前置校验 → 上下文组装 → 流式生成 → 结果落盘（统一文段接口）→ 自动摘要
// 后端只提供统一的书籍实体存取与 /llm 中继，业务编排全部在此。
// 「生成什么」由 outputType 决定，「参考什么」由 selection 决定，操作只有 4 种（ArtifactOperation）
import * as api from '../api'
import type {
  ArtifactOperation,
  ArtifactType,
  ContextSelection,
  Novel,
  NovelArtifact,
  NovelChapter,
} from '../types'
import { findChapterArtifact } from '../types'
import { ARTIFACT_MESSAGES_MAX, temperatureOf } from './constants'
import { buildMessages } from './context'
import { GenerationError, chatOnce, chatStream } from './llm'
import { buildSummaryMessages } from './prompts'

// 生成请求体（op 决定必填字段）
export interface GenerateRequest {
  op: ArtifactOperation
  novelId: string
  /** 仅 generate：产出的文段类型（setting / outline / content / summary） */
  outputType?: ArtifactType
  /** revise / continue / rewrite-range 的目标文段 */
  targetId?: string
  /** generate outline/content/summary 时归属章节；outline 缺省时自动新建章节 */
  chapterId?: string
  /** revise / rewrite-range 的修改指令；generate / continue 的附加要求 */
  instruction?: string
  /** 仅 generate + content：目标篇幅（字） */
  targetLength?: number
  /** 仅 rewrite-range：选中区间（正文字符偏移） */
  range?: { start: number; end: number }
  /** 上下文勾选；缺省时按默认规则计算 */
  selection?: ContextSelection
}

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
  op: ArtifactOperation
  outputType?: ArtifactType
  targetId?: string
  novel: Novel
  chapter?: NovelChapter
  text: string
  /** 生成时实际使用的勾选（generate 落盘为新文段的 inputs） */
  selection: ContextSelection
  /** revise 的修改指令（记入目标文段 messages） */
  instruction?: string
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

// 生成结果落盘：generate 新建（version=1）/ revise 整体替换 / continue 拼接 /
// rewrite-range 区间替换；updateArtifact 内部维护 version +1
const persistGeneration = async (
  params: PersistParams,
): Promise<PersistResult> => {
  const { op, novel, chapter, text, selection, final } = params
  const result: PersistResult = {}
  if (!text.trim()) return result

  // 正文落盘后（final）自动生成/更新章节摘要；失败不阻塞流程，前端可手动重试
  const regenerateSummary = async (
    chapterId: string,
    content: string,
    contentArtifactId: string,
  ) => {
    try {
      const summary = await chatOnce({
        messages: buildSummaryMessages(content),
        temperature: temperatureOf('summary'),
      })
      if (summary.trim()) {
        const existingSummary = findChapterArtifact(novel, chapterId, 'summary')
        if (existingSummary) {
          await api.updateArtifact(novel.id, existingSummary.id, {
            content: summary.trim(),
            revision: { source: 'generate' },
          })
        } else {
          await api.createArtifact(novel.id, {
            type: 'summary',
            chapterId,
            content: summary.trim(),
            inputs: [contentArtifactId],
          })
        }
      }
    } catch (error: any) {
      console.error('[小说] 自动生成摘要失败:', error)
      result.summaryError = error.message
    }
  }

  if (op === 'generate') {
    if (params.outputType === 'setting') {
      await api.createArtifact(novel.id, {
        type: 'setting',
        title: deriveSettingTitle(
          text,
          novel.artifacts.filter((t) => t.type === 'setting').length,
        ),
        content: text,
        inputs: selection.artifactIds,
        estimatedTokens: params.estimatedTokens,
      })
      return result
    }
    if (!chapter) return result

    if (params.outputType === 'outline') {
      const existing = findChapterArtifact(novel, chapter.id, 'outline')
      if (existing) {
        await api.updateArtifact(novel.id, existing.id, {
          content: text,
          revision: { source: 'generate' },
        })
      } else {
        await api.createArtifact(novel.id, {
          type: 'outline',
          chapterId: chapter.id,
          content: text,
          inputs: selection.artifactIds,
          estimatedTokens: params.estimatedTokens,
        })
      }
      return result
    }

    if (params.outputType === 'summary') {
      if (final) {
        const existing = findChapterArtifact(novel, chapter.id, 'summary')
        if (existing) {
          await api.updateArtifact(novel.id, existing.id, {
            content: text.trim(),
            revision: { source: 'generate' },
          })
        } else {
          await api.createArtifact(novel.id, {
            type: 'summary',
            chapterId: chapter.id,
            content: text.trim(),
          })
        }
      }
      return result
    }

    // generate + content：新建或覆盖本章正文
    const existing = findChapterArtifact(novel, chapter.id, 'content')
    // 正文溯源快照 = 本章大纲文段 + 实际勾选
    const outlineId = findChapterArtifact(novel, chapter.id, 'outline')?.id
    const inputs = [...(outlineId ? [outlineId] : []), ...selection.artifactIds]

    let contentArtifactId: string
    if (existing) {
      const updated = await api.updateArtifact(novel.id, existing.id, {
        content: text,
        inputs,
        revision: { source: 'generate' },
      })
      contentArtifactId = updated.id
    } else {
      const created = await api.createArtifact(novel.id, {
        type: 'content',
        chapterId: chapter.id,
        content: text,
        inputs,
        estimatedTokens: params.estimatedTokens,
      })
      contentArtifactId = created.id
    }
    if (final) await regenerateSummary(chapter.id, text, contentArtifactId)
    return result
  }

  // revise / continue / rewrite-range：围绕目标文段修改
  const target: NovelArtifact | undefined = novel.artifacts.find(
    (t) => t.id === params.targetId,
  )
  if (!target) return result

  if (op === 'revise') {
    // 整体替换；部分结果（中断/出错）不覆盖原文段
    if (!final) return result
    // 节点对话：指令与 AI 回复都记入目标文段 messages（点入节点可继续之前的对话；
    // 保留最近 ARTIFACT_MESSAGES_MAX 条，超出丢弃最旧；沙箱规则见 context.ts）
    const messages = [
      ...target.messages,
      { role: 'user' as const, content: params.instruction ?? '' },
      { role: 'assistant' as const, content: text },
    ].slice(-ARTIFACT_MESSAGES_MAX)
    await api.updateArtifact(novel.id, target.id, {
      content: text,
      messages,
      revision: { source: 'revise', instruction: params.instruction },
    })
    if (target.type === 'content' && target.chapterId) {
      await regenerateSummary(target.chapterId, text, target.id)
    }
    return result
  }

  if (op === 'continue') {
    // 拼接续写；中断时保留已生成的部分
    const content = target.content + text
    await api.updateArtifact(novel.id, target.id, {
      content,
      revision: { source: 'continue', instruction: params.instruction },
    })
    if (final && target.chapterId) {
      await regenerateSummary(target.chapterId, content, target.id)
    }
    return result
  }

  // rewrite-range：字符区间替换；部分结果不覆盖原文段
  if (!final || !params.range) return result
  const content =
    target.content.slice(0, params.range.start) +
    text +
    target.content.slice(params.range.end)
  await api.updateArtifact(novel.id, target.id, {
    content,
    // 枚举无独立 rewrite-range 来源，语义归入 revise（整体重写类）
    revision: { source: 'revise', instruction: params.instruction },
  })
  if (target.chapterId) {
    await regenerateSummary(target.chapterId, content, target.id)
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
  const { op } = req

  // 定位目标文段 / 目标章节并做前置校验
  let chapter: NovelChapter | undefined
  let target: NovelArtifact | undefined

  if (op === 'generate') {
    if (!req.outputType) throw new Error('[小说] 缺少产出文段类型')
    if (req.outputType === 'outline') {
      if (req.chapterId) {
        chapter = novel.chapters.find((ch) => ch.id === req.chapterId)
        if (!chapter) throw new Error('[小说] 章节不存在')
      } else {
        chapter = (await api.createChapter(novel.id)) ?? undefined
        if (!chapter) throw new Error('[小说] 创建章节失败')
      }
    } else if (req.outputType === 'content' || req.outputType === 'summary') {
      chapter = novel.chapters.find((ch) => ch.id === req.chapterId)
      if (!chapter) throw new Error('[小说] 章节不存在')
    }
    // setting 无需章节
    if (
      req.outputType === 'content' &&
      !findChapterArtifact(novel, chapter!.id, 'outline')
    ) {
      throw new Error('[小说] 该章节还没有大纲，请先生成大纲')
    }
    if (
      req.outputType === 'summary' &&
      !findChapterArtifact(novel, chapter!.id, 'content')
    ) {
      throw new Error('[小说] 该章节还没有正文')
    }
  } else {
    target = novel.artifacts.find((t) => t.id === req.targetId)
    if (!target) throw new Error('[小说] 目标文段不存在')
    chapter = target.chapterId
      ? novel.chapters.find((ch) => ch.id === target!.chapterId)
      : undefined
    if (
      (op === 'revise' || op === 'rewrite-range') &&
      !req.instruction?.trim()
    ) {
      throw new Error('[小说] 请填写修改指令')
    }
    if (op === 'continue' && target.type !== 'content') {
      throw new Error('[小说] 仅正文文段支持续写')
    }
    if (op === 'rewrite-range') {
      if (target.type !== 'content') {
        throw new Error('[小说] 仅正文文段支持选段重写')
      }
      const length = target.content.length
      if (
        !req.range ||
        req.range.start >= req.range.end ||
        req.range.end > length
      ) {
        throw new Error('[小说] 选中区间无效')
      }
    }
  }

  const { messages, selection, estimatedTokens } = buildMessages({
    novel,
    op,
    outputType: req.outputType,
    chapter,
    target,
    selection: req.selection,
    instruction: req.instruction,
    targetLength: req.targetLength,
    range: req.range,
  })
  const temperature = temperatureOf(
    op === 'generate' ? req.outputType! : target!.type,
  )

  // 摘要走非流式，全文作为单个 delta 发出
  if (op === 'generate' && req.outputType === 'summary') {
    const text = await chatOnce({ messages, temperature })
    if (text) handlers.onDelta?.(text)
    const extra = await persistGeneration({
      op,
      outputType: req.outputType,
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
        op,
        outputType: req.outputType,
        targetId: req.targetId,
        novel,
        chapter,
        text: partial,
        selection,
        instruction: req.instruction,
        estimatedTokens,
        final: false,
        range: req.range,
      })
    } catch (e) {
      console.error('[小说] 部分结果落盘失败:', e)
    }
    throw error
  }

  const extra = await persistGeneration({
    op,
    outputType: req.outputType,
    targetId: req.targetId,
    novel,
    chapter,
    text,
    selection,
    instruction: req.instruction,
    estimatedTokens,
    final: !aborted,
    range: req.range,
  })
  handlers.onDone?.({
    chapterId: chapter?.id,
    usage: usage ?? undefined,
    aborted,
    ...extra,
  })
}
