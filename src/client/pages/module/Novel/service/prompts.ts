// 小说生成模块全部 prompt 模板（设计见 docs/novel/prompts.md）
// 原则：结构化但字段少、允许留空；约束走向，放开笔法
// （自服务端 module/novel/prompts 前移，生成编排整体在前端 service/ 完成）
import type {
  ChatMessage,
  NovelChapter,
  NovelOutline,
  NovelSetting,
} from '../types'

// 通用系统提示（prompts.md 第 1 节），所有生成任务共用
export const BASE_SYSTEM_PROMPT = `你是一名中文网络小说作家，擅长成人向言情小说，文笔直白流畅，重视感官细节与人物情绪的刻画。
- 严格使用简体中文写作
- 严格遵循用户提供的大纲与设定，但具体措辞、场景展开、对话内容由你发挥
- 不要输出任何与小说无关的内容（不要解释、不要总结、不要加章节外的备注）
- 不要复述或引用本提示词中的任何说明文字`

export const formatSettings = (settings: NovelSetting[]): string =>
  `【核心设定】\n${settings.map((s) => `《${s.title}》\n${s.content}`).join('\n\n')}`

export const formatRefMaterials = (
  refs: { title: string; content: string }[],
  header = '【参考材料】',
): string =>
  `${header}\n${refs.map((r) => `===\n《${r.title}》\n${r.content}\n===`).join('\n\n')}`

export const formatSummaries = (chapters: NovelChapter[]): string =>
  `【前情摘要】\n${chapters.map((c) => `第${c.index}章：${c.summary}`).join('\n')}`

export const formatFullChapters = (chapters: NovelChapter[]): string =>
  `【最近章节全文】\n${chapters
    .map(
      (c) => `第${c.index}章${c.title ? `《${c.title}》` : ''}\n${c.content}`,
    )
    .join('\n\n')}`

export const formatOutline = (outline: NovelOutline): string => {
  const beats = outline.beats.map((b, i) => `${i + 1}. ${b}`).join('\n')
  return `【本章大纲】\n基调：${outline.tone || '无'}\n节拍：\n${beats}\n禁区：${outline.taboos || '无'}`
}

// 生成核心设定（kind: setting）
export const buildSettingTask = (
  instruction: string,
  hasRefs: boolean,
): string =>
  `【任务】
${hasRefs ? '参考上述材料，按以下要求产出一份核心设定：' : '按以下要求产出一份核心设定：'}
${instruction}

要求：
- 只产出设定本身，不要写故事
- 篇幅控制在 800 字以内
- 若要求涉及角色，用条目列出：姓名 / 外貌 / 性格 / 与其他角色的关系
- 若要求涉及世界观或故事基调，分小节陈述`

// 生成章节大纲（kind: outline），JSON 输出供前端解析成可编辑节拍
export const buildOutlineTask = (
  nextIndex: number,
  instruction?: string,
): string =>
  `【任务】
为第 ${nextIndex} 章设计大纲。输出 JSON（不要输出其他内容）：
{
  "beats": ["节拍1", "节拍2", "..."],
  "tone": "本章基调与目标，一句话",
  "taboos": "本章不要发生的事，一句话，可为空字符串"
}

要求：
- 节拍 4-8 条，每条一句话，按顺序描述关键情节点
- 节拍只写「发生什么」，不写「怎么写」；把描写空间留给正文
- 与前文的角色关系、状态保持连续${instruction ? `\n- ${instruction}` : ''}`

// 按指令微调大纲（kind: revise-outline）
export const buildReviseOutlineTask = (
  outline: NovelOutline | null | undefined,
  instruction: string,
): string =>
  `【现有大纲】
${JSON.stringify(outline ?? { beats: [] }, null, 2)}

【修改指令】
${instruction}

只按修改指令调整，其余节拍保持不变，仍输出完整 JSON（不要输出其他内容）。`

// 生成章节正文（kind: content）
export const buildContentTask = (
  index: number,
  targetLength: number,
  instruction?: string,
): string =>
  `【任务】
按大纲写作第 ${index} 章正文。
- 严格按节拍顺序推进，不跳过、不提前剧透后续节拍之外的情节
- 每个节拍充分展开：动作、对话、心理、感官细节，不要一笔带过
- 目标篇幅 ${targetLength} 字左右
- 不得出现「禁区」中列出的内容
- 不要使用大纲中的原句
- 写到本章节拍结束为止，不要收束全书
- 直接输出正文，不要输出章节号、标题或任何说明${instruction ? `\n\n附加要求：\n${instruction}` : ''}`

// 续写正文（kind: continue-content），已有正文末尾作为前缀
export const buildContinueTask = (
  index: number,
  tail: string,
  instruction?: string,
): string =>
  `【任务】
从下文结尾处无缝续写第 ${index} 章正文，不要重复已有内容，保持风格与节奏一致：
===
${tail}
===
- 直接输出续写内容，不要输出章节号、标题或任何说明${instruction ? `\n\n附加要求：\n${instruction}` : ''}`

// 重写选中段落（kind: rewrite-selection）
export const buildRewriteSelectionTask = (
  content: string,
  selection: string,
  instruction: string,
): string =>
  `【正文全文】
${content}

【需要重写的段落】
${selection}

【修改指令】
${instruction}

只输出重写后的段落文本（保持与上下文衔接），不要输出其余部分。`

// 按指令整章微调（kind: revise-content）
export const buildReviseContentTask = (
  content: string,
  instruction: string,
): string =>
  `【正文全文】
${content}

【修改指令】
${instruction}

【任务】
只按修改指令调整，其余内容保持原样，输出修改后的完整正文，不要输出任何说明。`

// 生成章节摘要（kind: summary，非流式）
// 摘要是给模型看的「续写一致性备忘录」，不是给读者的简介
export const buildSummaryTask = (content: string): string =>
  `【章节正文】
${content}

【任务】
为以上章节写一段供后续续写使用的摘要（这是给模型看的「续写一致性备忘录」，不是给读者的简介），200-400 字，必须覆盖：
- 发生的关键事件（按顺序）
- 角色关系/态度发生的变化
- 新出现的设定、名词、道具
- 结尾时各角色的位置、情绪与未解决的悬念
只输出摘要文本。`

// 剥离 markdown 代码块包装（```json ... ```），模型常把 JSON 包在代码块里
export const stripCodeFence = (text: string): string => {
  const trimmed = text.trim()
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```\s*$/i)
  return match ? match[1].trim() : trimmed
}

// 解析大纲 JSON，失败抛错（调用方负责重试/兜底）
export const parseOutline = (text: string): NovelOutline => {
  const cleaned = stripCodeFence(text)
  // 模型可能在 JSON 前后夹带说明文字，截取第一个 { 到最后一个 }
  let candidate = cleaned
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start !== -1 && end > start) {
    candidate = candidate.slice(start, end + 1)
  }
  const parsed = JSON.parse(candidate)
  if (
    !parsed ||
    !Array.isArray(parsed.beats) ||
    !parsed.beats.every((b: unknown) => typeof b === 'string')
  ) {
    throw new Error('大纲 JSON 缺少 beats 字符串数组')
  }
  const outline: NovelOutline = { beats: parsed.beats }
  if (typeof parsed.tone === 'string' && parsed.tone) {
    outline.tone = parsed.tone
  }
  if (typeof parsed.taboos === 'string' && parsed.taboos) {
    outline.taboos = parsed.taboos
  }
  return outline
}

// 大纲 JSON 解析失败后的修复重试消息（在原对话基础上要求模型仅重新输出 JSON）
export const buildOutlineRepairMessages = (
  original: ChatMessage[],
  broken: string,
): ChatMessage[] => [
  ...original,
  { role: 'assistant', content: broken },
  {
    role: 'user',
    content:
      '你的输出无法解析为合法 JSON。请只重新输出符合要求的大纲 JSON，不要输出任何其他内容。',
  },
]
