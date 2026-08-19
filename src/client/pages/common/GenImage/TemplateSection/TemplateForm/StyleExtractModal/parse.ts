import type { StyleAnalysis } from './types'

const STYLE_ANALYSIS_KEYS = [
  'media_style',
  'camera_lens',
  'composition',
  'color_palette',
  'lighting',
  'texture_effects',
  'subject_main',
  'subject_detail',
  'environment',
  'ui_text',
  'atmosphere',
  'art_reference',
] as const satisfies readonly (keyof StyleAnalysis)[]

const isStyleAnalysis = (value: unknown): value is StyleAnalysis => {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return STYLE_ANALYSIS_KEYS.every((key) => typeof record[key] === 'string')
}

const tryParseJson = (value: string): unknown => {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export const parseStyleAnalysis = (content: string): StyleAnalysis => {
  const trimmed = content.trim()
  let parsed = tryParseJson(trimmed)

  if (!parsed) {
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) parsed = tryParseJson(fenceMatch[1].trim())
  }

  if (!parsed) {
    const braceMatch = trimmed.match(/\{[\s\S]*\}/)
    if (braceMatch) {
      const cleaned = braceMatch[0].replace(/'/g, '"').replace(/,\s*}/g, '}')
      parsed = tryParseJson(cleaned)
    }
  }

  if (!parsed) throw new Error('无法解析图片风格分析结果')
  if (!isStyleAnalysis(parsed)) throw new Error('图片风格分析结果格式无效')
  return parsed
}
