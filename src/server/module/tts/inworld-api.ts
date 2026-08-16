import type { InworldVoiceItem } from '@/shared/tts/inworld'
import fs from 'fs-extra'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { TTS_INWORLD_MODEL_ID } from './client-const'
import { TTS_INWORLD_OUTPUT_DIR } from './server-const'
import { getTTSInworldApiKey } from './settings'

export interface InworldVoiceListResponse {
  voices?: InworldVoiceItem[]
}

export interface InworldTTSResponse {
  audioContent?: string
  usage?: {
    processedCharactersCount: number
    modelId: string
  }
  code?: number
  message?: string
}

export const generateAndSaveAudioInworld = async ({
  text,
  voiceId,
}: {
  text: string
  voiceId: string
}): Promise<string> => {
  const apiKey = (await getTTSInworldApiKey()) || process.env.INWORLD_API_KEY

  if (!apiKey) {
    throw new Error('No API key provided for Inworld TTS')
  }

  const response = await fetch('https://api.inworld.ai/tts/v1/voice', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      voiceId,
      modelId: TTS_INWORLD_MODEL_ID,
      deliveryMode: 'BALANCED',
      applyTextNormalization: 'ON',
      audioConfig: { speakingRate: 1.1 },
    }),
  })

  const res: InworldTTSResponse = await response.json()

  if (!response.ok || res.code || res.message) {
    throw new Error(`Inworld TTS Error: ${res.message || response.statusText}`)
  }

  if (!res.audioContent) {
    throw new Error('No audio content returned from Inworld')
  }

  const audioBuffer = Buffer.from(res.audioContent, 'base64')

  const fileName = `${uuidv4()}.mp3`
  const filePath = path.join(TTS_INWORLD_OUTPUT_DIR, fileName)

  await fs.ensureDir(TTS_INWORLD_OUTPUT_DIR)
  await fs.writeFile(filePath, audioBuffer)

  return fileName
}
