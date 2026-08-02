// 小说生成模块全部 prompt 模板（设计见 docs/novel/prompts.md）
// 原则：结构化但字段少、允许留空；约束走向，放开笔法
// 生成编排整体在前端 service/ 完成；参考文/设定/大纲/正文/摘要统一为 NovelText
import type { ChatMessage, NovelText } from '../types'

// 通用系统提示（prompts.md 第 1 节），所有生成任务共用
export const BASE_SYSTEM_PROMPT = `你是一名中文网络小说作家，擅长成人向言情小说，文笔直白流畅，重视感官细节与人物情绪的刻画。
- 严格使用简体中文写作
- 严格遵循用户提供的大纲与设定，但具体措辞、场景展开、对话内容由你发挥
- 不要输出任何与小说无关的内容（不要解释、不要总结、不要加章节外的备注）
- 不要复述或引用本提示词中的任何说明文字`

export const formatSettings = (settings: NovelText[]): string =>
  `【核心设定】\n${settings.map((s) => `《${s.title}》\n${s.content}`).join('\n\n')}`

export const formatRefMaterials = (
  refs: NovelText[],
  header = '【参考材料】',
): string =>
  `${header}\n${refs.map((r) => `===\n《${r.title}》\n${r.content}\n===`).join('\n\n')}`

// 前情摘要（index 为章节序号，由调用方按章节创建时间排序算出）
export const formatSummaries = (
  entries: { index: number; content: string }[],
): string =>
  `【前情摘要】\n${entries.map((e) => `第${e.index}章：${e.content}`).join('\n')}`

export const formatFullChapters = (
  entries: { index: number; title: string; content: string }[],
): string =>
  `【最近章节全文】\n${entries
    .map(
      (e) => `第${e.index}章${e.title ? `《${e.title}》` : ''}\n${e.content}`,
    )
    .join('\n\n')}`

// 大纲为纯文本（模型按约定格式输出，落盘后可由用户自由编辑）
export const formatOutline = (outline: string): string =>
  `【本章大纲】\n${outline}`

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

// 生成章节大纲（kind: outline），纯文本输出，落盘后用户可直接编辑
export const buildOutlineTask = (
  nextIndex: number,
  instruction?: string,
): string =>
  `【任务】
为第 ${nextIndex} 章设计大纲，严格按以下格式输出纯文本：
基调：本章基调与目标，一句话
节拍：
1. 节拍1
2. 节拍2
……
禁区：本章不要发生的事，一句话，没有则写「无」

要求：
- 节拍 4-8 条，每条一句话，按顺序描述关键情节点
- 节拍只写「发生什么」，不写「怎么写」；把描写空间留给正文
- 与前文的角色关系、状态保持连续${instruction ? `\n- ${instruction}` : ''}
- 不要输出格式之外的任何说明`

// 按指令微调大纲（kind: revise-outline）
export const buildReviseOutlineTask = (
  outline: string,
  instruction: string,
): string =>
  `【现有大纲】
${outline}

【修改指令】
${instruction}

只按修改指令调整，其余节拍保持不变，仍按原格式输出完整大纲（不要输出其他内容）。`

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

// 摘要任务的消息组装（正文完成后自动生成摘要用，不走完整上下文）
export const buildSummaryMessages = (content: string): ChatMessage[] => [
  { role: 'system', content: BASE_SYSTEM_PROMPT },
  { role: 'user', content: buildSummaryTask(content) },
]
