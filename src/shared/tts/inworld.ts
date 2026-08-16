// Inworld 语音列表项（前后端共享：前端音色列表展示 / 后端语音列表响应结构）
export interface InworldVoiceItem {
  name: string
  voiceId: string
  langCode: string
  displayName: string
  description: string
  tags: string[]
  categories: string[]
  source: string
  gender: string
  ageGroup: string
  promptLanguages: string[]
}
