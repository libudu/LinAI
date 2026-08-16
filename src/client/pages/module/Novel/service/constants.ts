// 生成相关常量（自服务端 module/novel/constants 前移）
import type { ArtifactType } from '../types'

export const REF_MAX_CHARS = 50_000 // 每篇参考文最多保留末尾 50k 字符（前端截取后上传）

export const DEFAULT_RECENT_FULL_CHAPTERS = 3 // 默认勾选的上限保护：历史正文超出 N 章时更早章节改挂摘要（创建书时随书保存）
export const DEFAULT_TARGET_LENGTH = 3_000 // 正文默认目标篇幅（字）
export const CONTINUE_PREFIX_CHARS = 2_000 // 续写时携带已有正文末尾的字数

export const ARTIFACT_MESSAGES_MAX = 20 // 每个文段保留的最近对话轮数上限，超出丢弃最旧

// 各操作的 temperature（调优备忘录见 docs/novel/prompts.md 第 6 节）：
// generate 按产出类型取值，revise/continue/rewrite-range 按目标文段类型取值
const TEMPERATURES: Record<ArtifactType, number> = {
  ref: 0.8, // ref 不可生成，占位
  setting: 0.8,
  outline: 0.7,
  content: 0.9,
  summary: 0.3,
}

export const temperatureOf = (type: ArtifactType): number => TEMPERATURES[type]
