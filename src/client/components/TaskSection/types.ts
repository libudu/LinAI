export interface TaskTemplate {
  id: string
  image: string
  prompt: string
  quality: string
  aspectRatio: string
  createdAt: number
  source: 'wan-video' | 'gemini-image'
}

export interface GeminiTaskTemplate extends TaskTemplate {
  // Add any gemini specific fields here if needed
}
