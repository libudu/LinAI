// TTS 项目数据类型（前端复用：src/client/pages/module/GeminiTTS 直接引用）
// 项目数据已由前端通过通用实体接口（/api/storage/entities/tts.projects）整体读写，
// 后端不再提供项目 CRUD，本文件只保留类型与旧格式迁移所需的结构定义

export interface TTSCharacter {
  id: string
  name: string
  voiceId: string
}

export interface TTSDialogue {
  id: string
  characterId: string
  content: string
  audioUrl?: string
  createdAt: number
  data?: {
    renpyId: string
  }
}

export interface TTSProject {
  id: string
  name: string
  description: string
  renpyExportDir?: string
  characters: TTSCharacter[]
  dialogues: TTSDialogue[]
  createdAt: number
  updatedAt: number
}

// EntityStore('tts.projects') 的摘要：项目列表所需信息，写入时由前端提供
export interface TTSSummary {
  name: string
  description: string
}
