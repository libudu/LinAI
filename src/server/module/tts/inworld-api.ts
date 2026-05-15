import fs from 'fs-extra'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { getTTSInworldApiKey } from '../../common/config'
import { TTS_INWORLD_OUTPUT_DIR } from './constants'

export interface InworldVoiceItem {
  name: string
  voiceId: string
  langCode: string
  displayName: string
  description: string
  tags: string[]
  categories: string[]
  source: string
  gender: string
  ageGroup: string
  promptLanguages: string[]
}

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
  const apiKey = getTTSInworldApiKey() || process.env.INWORLD_API_KEY

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
      modelId: 'inworld-tts-2',
      deliveryMode: 'BALANCED',
      applyTextNormalization: 'ON',
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

export const listInworldVoices = async (): Promise<InworldVoiceItem[]> => {
  const apiKey = getTTSInworldApiKey() || process.env.INWORLD_API_KEY

  if (!apiKey) {
    throw new Error('No API key provided for Inworld TTS')
  }

  const url = new URL('https://api.inworld.ai/voices/v1/voices')
  url.searchParams.append('filter', 'source = "IVC"')
  url.searchParams.append('orderBy', 'display_name asc')
  url.searchParams.append('pageSize', '100') // increased from 20 to get more

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Basic ${apiKey}`,
    },
  })

  const res: InworldVoiceListResponse & { code?: number; message?: string } =
    await response.json()

  if (!response.ok || res.code || res.message) {
    throw new Error(`Inworld TTS Error: ${res.message || response.statusText}`)
  }

  return res.voices || []
}
