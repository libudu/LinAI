import { hc } from 'hono/client'
import type { AppType } from '../../../../server'

const client = hc<AppType>('/')

/**
 * 调用 Gemini TTS 接口生成语音
 * @param backgroundPrompt 故事背景
 * @param voicePrompt 音色微调
 * @param contentPrompt 对话内容
 * @param voiceName 音色名称
 * @returns 生成的音频 URL
 */
export interface GenerateTTSParams {
  backgroundPrompt?: string
  voicePrompt?: string
  contentPrompt: string
  voiceId: string
}

export async function generateTTS({
  backgroundPrompt,
  voicePrompt,
  contentPrompt,
  voiceId,
}: GenerateTTSParams): Promise<string> {
  const promptParts: string[] = []

  if (backgroundPrompt) {
    promptParts.push(`### Story Background\n${backgroundPrompt}`)
  }

  if (voicePrompt) {
    promptParts.push(`### Character Voice\n${voicePrompt}`)
  }

  promptParts.push(`### TRANSCRIPT\n${contentPrompt}`)

  const prompt = promptParts.join('\n\n')

  const response = await client.api['tts-ali'].generate.$post({
    json: { prompt, voiceId },
  })

  const data = await response.json()

  if (data.success) {
    return data.url
  } else {
    throw new Error(data.error || '生成失败')
  }
}
