import { hc } from 'hono/client'
import type { AppType } from '../../../../../server'

const client = hc<AppType>('/')

export async function generateTTS({
  text,
  instruction,
  voiceId,
}: {
  text: string
  instruction?: string
  voiceId: string
}): Promise<string> {
  const response = await client.api['tts-ali'].generate.$post({
    json: { text, instruction, voiceId },
  })

  const data = await response.json()

  if (data.success) {
    return data.url
  } else {
    throw new Error(data.error || '生成失败')
  }
}
