import { hc } from 'hono/client'
import type { AppType } from '../../../../../server'
import { TTS_INWORLD_MODEL_ID } from '../../../../../server/module/tts/client-const'

const client = hc<AppType>('/')

export async function generateTTS({
  text,
  voiceId,
}: {
  text: string
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

export async function previewVoice(
  voiceId: string,
  apiKey: string,
): Promise<string> {
  const response = await fetch(
    `https://api.inworld.ai/tts/v1/voice:preview?voice_id=${voiceId}&model_id=${TTS_INWORLD_MODEL_ID}`,
    {
      headers: {
        Authorization: `Basic ${apiKey}`,
      },
    },
  )

  if (!response.ok) {
    throw new Error('试听请求失败')
  }

  const data = await response.json()
  if (data.audioContent) {
    return `data:audio/mp3;base64,${data.audioContent}`
  }

  throw new Error('试听无数据返回')
}
