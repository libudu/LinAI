import type { StyleAnalysis } from '@/server/api/style-analyze'

export interface DimensionDef {
  key: keyof StyleAnalysis
  label: string
}

export const STYLE_DIMENSIONS: DimensionDef[] = [
  { key: 'media_style', label: '媒介与风格' },
  { key: 'camera_lens', label: '镜头与视角' },
  { key: 'composition', label: '构图' },
  { key: 'color_palette', label: '色彩与色调' },
  { key: 'lighting', label: '光影' },
  { key: 'texture_effects', label: '质感与特效' },
  { key: 'subject_main', label: '主体描述' },
  { key: 'subject_detail', label: '主体细节' },
  { key: 'environment', label: '环境与背景' },
  { key: 'ui_text', label: '文字与UI' },
  { key: 'atmosphere', label: '氛围与情绪' },
  { key: 'art_reference', label: '艺术参考' },
]

export const EMPTY_ANALYSIS: StyleAnalysis = {
  media_style: '',
  camera_lens: '',
  composition: '',
  color_palette: '',
  lighting: '',
  texture_effects: '',
  subject_main: '',
  subject_detail: '',
  environment: '',
  ui_text: '',
  atmosphere: '',
  art_reference: '',
}

export function composePrompt(
  analysis: StyleAnalysis,
  selections: Set<keyof StyleAnalysis>,
): string {
  return STYLE_DIMENSIONS.map((dim) => {
    if (!selections.has(dim.key)) return null
    const value = analysis[dim.key].trim()
    return value || null
  })
    .filter((v): v is string => v !== null)
    .join('，')
}
