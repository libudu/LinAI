import { relayRequest } from '@/client/service/relay'
import type { AppType } from '@/server'
import { TTS_INWORLD_MODEL_ID } from '@/server/module/tts/client-const'
import { hc } from 'hono/client'

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

export async function previewVoice(voiceId: string): Promise<string> {
  // 走受限请求中继，Inworld 密钥由服务端注入，前端不再持有
  const data = await relayRequest<{ audioContent?: string }>('inworld', {
    method: 'GET',
    path: `/tts/v1/voice:preview?voice_id=${encodeURIComponent(voiceId)}&model_id=${TTS_INWORLD_MODEL_ID}`,
  })

  if (data.audioContent) {
    return `data:audio/mp3;base64,${data.audioContent}`
  }

  throw new Error('试听无数据返回')
}
