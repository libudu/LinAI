// TTS 项目业务模型由前端维护，通过通用实体存储整体读写。
// 后端只管理存储信封，不依赖完整项目结构。

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
