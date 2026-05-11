import { hc } from 'hono/client'
import type { AppType } from '../../../../server'

const client = hc<AppType>('/')

/**
 * 调用 Gemini TTS 接口生成语音
 * @param prompt 文本内容
 * @param voiceName 音色名称
 * @returns 生成的音频 URL
 */
export async function generateTTS(
  prompt: string,
  voiceName: string,
): Promise<string> {
  const response = await client.api['gemini-tts'].generate.$post({
    json: { prompt, voiceName },
  })

  const data = await response.json()

  if (data.success) {
    return data.url
  } else {
    throw new Error(data.error || '生成失败')
  }
}
