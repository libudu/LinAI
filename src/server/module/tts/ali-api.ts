import fs from 'fs-extra'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { getTTSAliApiKey } from '../../common/config'
import { TTS_ALI_OUTPUT_DIR } from './constants'

export interface AliTTSResponse {
  request_id: string
  output?: {
    finish_reason: string
    audio?: {
      data?: string
      url?: string
      id?: string
      expires_at?: number
    }
  }
  usage?: {
    characters: number
  }
  code?: string
  message?: string
}

export const generateAndSaveAudioQwen = async ({
  prompt,
  voiceName,
  isTrial = false,
}: {
  prompt: string
  voiceName: string
  isTrial?: boolean
}): Promise<string> => {
  const MODEL_NAME = 'cosyvoice-v3-flash' // or 'cosyvoice-v1' depending on requirements
  const apiKey = getTTSAliApiKey() || process.env.DASHSCOPE_API_KEY

  if (!apiKey) {
    throw new Error('No API key provided for Qwen TTS')
  }

  const response = await fetch(
    'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        input: {
          text: prompt,
          voice: voiceName,
          format: 'wav',
          sample_rate: 24000,
        },
      }),
    },
  )

  const res: AliTTSResponse = await response.json()

  if (res.code && res.message) {
    throw new Error(`Qwen TTS Error: ${res.message}`)
  }

  if (!res.output?.audio?.url) {
    throw new Error('No audio URL returned from Qwen')
  }

  // Fetch the actual audio file from the returned URL
  const audioResponse = await fetch(res.output.audio.url)
  if (!audioResponse.ok) {
    throw new Error(
      `Failed to fetch audio from Qwen URL: ${audioResponse.statusText}`,
    )
  }

  const audioBuffer = Buffer.from(await audioResponse.arrayBuffer())

  let fileName = `${uuidv4()}.wav`
  let filePath = path.join(TTS_ALI_OUTPUT_DIR, fileName)

  if (isTrial) {
    const trialDir = path.join(TTS_ALI_OUTPUT_DIR, 'trial')
    await fs.ensureDir(trialDir)
    fileName = `trial/${voiceName}.wav`
    filePath = path.join(trialDir, `${voiceName}.wav`)
  } else {
    await fs.ensureDir(TTS_ALI_OUTPUT_DIR)
  }

  await fs.writeFile(filePath, audioBuffer)

  return fileName
}

export interface AliVoiceListItem {
  voice_name: string
}

export const listCustomVoices = async (
  prefix: string = '',
): Promise<AliVoiceListItem[]> => {
  const apiKey = getTTSAliApiKey() || process.env.DASHSCOPE_API_KEY

  if (!apiKey) {
    throw new Error('No API key provided for Qwen TTS')
  }

  const response = await fetch(
    'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'voice-enrollment',
        input: {
          action: 'list_voice',
          prefix: prefix,
          page_size: 100, // fetching a large number of voices
          page_index: 1,
        },
      }),
    },
  )

  const res = await response.json()

  if (res.code && res.message) {
    throw new Error(`Qwen TTS Error: ${res.message}`)
  }

  return res.output?.voice_list || []
}
