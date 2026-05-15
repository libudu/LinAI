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
  const response = await client.api['tts-inworld'].generate.$post({
    json: { text, voiceId },
  })

  const data = await response.json()

  if (data.success) {
    return data.url
  } else {
    throw new Error(data.error || '生成失败')
  }
}
