// 生成相关常量（自服务端 module/novel/constants 前移）
import type { GenerateKind } from '../types'

export const REF_MAX_CHARS = 50_000 // 每篇参考文最多保留末尾 50k 字符（前端截取后上传）
export const REF_TOTAL_MAX_CHARS = 500_000 // 单本书参考文总字符上限（前端校验）

export const DEFAULT_RECENT_FULL_CHAPTERS = 3 // 默认携带最近几章全文（创建书时随书保存）
export const DEFAULT_TARGET_LENGTH = 3_000 // 正文默认目标篇幅（字）
export const CONTINUE_PREFIX_CHARS = 2_000 // 续写时携带已有正文末尾的字数

// 各生成任务的 temperature（调优备忘录见 docs/novel/prompts.md 第 6 节）
export const TEMPERATURES: Record<GenerateKind, number> = {
  setting: 0.8,
  outline: 0.7,
  'revise-outline': 0.7,
  content: 0.9,
  'continue-content': 0.9,
  'rewrite-selection': 0.9,
  'revise-content': 0.9,
  summary: 0.3,
}
