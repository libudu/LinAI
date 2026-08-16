// AI 局部修改（patch）：模型输出 ArtifactPatch JSON → 严格校验 → 内存顺序应用。
// 安全原则：find 必须恰好出现一次，任何一步失败整体报错，绝不允许静默错误应用；
// 校验失败带错误信息重试一次，再失败由调用方降级为整体 revise
import type { ArtifactEditOp, ArtifactPatch } from '../types'
import { chatOnce } from './llm'
import { buildPatchMessages } from './prompts'

const PATCH_TEMPERATURE = 0.3 // 结构化输出用低温，降低 JSON 与 find 摘取出错率

// patch 的最小文段长度：太短的文段整体 revise 更稳（patch 没有收益）
const PATCH_MIN_CONTENT_CHARS = 800

// 全局指令信号：命中则不使用 patch（整体重写更合适）。
// 注意「润色/扩写」之类不带范围词时不算全局信号——它们是否局部由 LOCAL_HINT 判定
const GLOBAL_HINT =
  /整体|全文|全篇|整章|整段都|全部|所有|重写|重新写|风格|语气|人称|视角|压缩|精简/

// 局部指令信号：明确指向某个片段
const LOCAL_HINT =
  /第\s*[0-9一二三四五六七八九十百千]+\s*[段节句行]|这段|这句|此处|这句话|这一段|那段|删掉|删除|插入|改成|改为|替换|加上|加一句|补一句|末尾|结尾处|开头/

// patch / 整体 revise 的前端启发式选择（不做模型判断）：
// 文段足够长 + 指令带局部信号 + 不带全局信号 → patch，其余一律整体 revise（保守兜底）
export const shouldUsePatch = (
  instruction: string,
  contentLength: number,
): boolean =>
  contentLength >= PATCH_MIN_CONTENT_CHARS &&
  LOCAL_HINT.test(instruction) &&
  !GLOBAL_HINT.test(instruction)

// 统计子串出现次数（非重叠）
const countOccurrences = (haystack: string, needle: string): number => {
  if (!needle) return 0
  let count = 0
  let i = 0
  while ((i = haystack.indexOf(needle, i)) !== -1) {
    count++
    i += needle.length
  }
  return count
}

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0

const validateOp = (raw: any, index: number): ArtifactEditOp => {
  const where = `第 ${index + 1} 个操作`
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${where}不是对象`)
  }
  switch (raw.op) {
    case 'replace-text':
    case 'insert-after':
      if (!isNonEmptyString(raw.find)) {
        throw new Error(`${where}（${raw.op}）缺少有效的 find`)
      }
      if (typeof raw.content !== 'string') {
        throw new Error(`${where}（${raw.op}）缺少 content`)
      }
      return { op: raw.op, find: raw.find, content: raw.content }
    case 'delete-text':
      if (!isNonEmptyString(raw.find)) {
        throw new Error(`${where}（delete-text）缺少有效的 find`)
      }
      return { op: 'delete-text', find: raw.find }
    case 'append':
      if (typeof raw.content !== 'string' || raw.content.length === 0) {
        throw new Error(`${where}（append）缺少有效的 content`)
      }
      return { op: 'append', content: raw.content }
    default:
      throw new Error(`${where}的 op 无法识别：${String(raw.op)}`)
  }
}

// 解析模型输出为 ArtifactPatch（容错：截取首个 { 到末个 }，容忍代码块包裹）
export const parsePatch = (raw: string): ArtifactPatch => {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) {
    throw new Error('输出中未找到 JSON 对象')
  }
  let parsed: any
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch {
    throw new Error('输出不是合法的 JSON')
  }
  if (!Array.isArray(parsed?.operations)) {
    throw new Error('JSON 缺少 operations 数组')
  }
  if (parsed.operations.length === 0) {
    throw new Error('operations 为空，未包含任何编辑操作')
  }
  return { operations: parsed.operations.map(validateOp) }
}

// 校验并顺序应用：返回新内容；任何 find 不唯一/找不到即抛错（带操作序号与原因）
export const applyPatch = (content: string, patch: ArtifactPatch): string => {
  let result = content
  patch.operations.forEach((op, i) => {
    const where = `第 ${i + 1} 个操作（${op.op}）`
    if (op.op === 'append') {
      result += op.content
      return
    }
    const count = countOccurrences(result, op.find)
    if (count === 0) {
      throw new Error(
        `${where}的 find 未在文段中出现：「${op.find.slice(0, 30)}…」`,
      )
    }
    if (count > 1) {
      throw new Error(
        `${where}的 find 在文段中出现 ${count} 次，必须恰好一次：「${op.find.slice(0, 30)}…」`,
      )
    }
    if (op.op === 'replace-text') {
      result = result.replace(op.find, op.content)
    } else if (op.op === 'insert-after') {
      result = result.replace(op.find, op.find + op.content)
    } else {
      // delete-text
      result = result.replace(op.find, '')
    }
  })
  return result
}

export interface PatchResult {
  patch: ArtifactPatch
  newContent: string
}

// 向模型请求 patch（非流式，JSON 输出不适合流式渲染）：
// 校验失败把错误反馈给模型重试一次，再失败抛错（调用方降级整体 revise）
export const requestPatch = async (
  content: string,
  instruction: string,
): Promise<PatchResult> => {
  let lastError: string | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await chatOnce({
      messages: buildPatchMessages(content, instruction, lastError),
      temperature: PATCH_TEMPERATURE,
    })
    try {
      const patch = parsePatch(raw)
      const newContent = applyPatch(content, patch)
      return { patch, newContent }
    } catch (error: any) {
      lastError = error.message
      console.warn(`[小说] patch 第 ${attempt + 1} 次校验失败:`, lastError)
    }
  }
  throw new Error(lastError ?? 'patch 生成失败')
}
