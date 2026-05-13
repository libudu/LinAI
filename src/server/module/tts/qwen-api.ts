import fs from 'fs-extra'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { getYunwuApiKey } from '../../common/config'
import { QWEN_TTS_OUTPUT_DIR } from './constants'

export interface QwenTTSResponse {
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
  const MODEL_NAME = 'cosyvoice-v3-flash'
  // Use getYunwuApiKey which stores the proxy API key or direct API key
  const apiKey = getYunwuApiKey() || process.env.DASHSCOPE_API_KEY
  
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
  
  const res: QwenTTSResponse = await response.json()
  
  if (res.code && res.message) {
    throw new Error(`Qwen TTS Error: ${res.message}`)
  }
  
  if (!res.output?.audio?.url) {
    throw new Error('No audio URL returned from Qwen')
  }

  // Fetch the actual audio file from the returned URL
  const audioResponse = await fetch(res.output.audio.url)
  if (!audioResponse.ok) {
    throw new Error(`Failed to fetch audio from Qwen URL: ${audioResponse.statusText}`)
  }
  
  const audioBuffer = Buffer.from(await audioResponse.arrayBuffer())

  let fileName = `${uuidv4()}.wav`
  let filePath = path.join(QWEN_TTS_OUTPUT_DIR, fileName)

  if (isTrial) {
    const trialDir = path.join(QWEN_TTS_OUTPUT_DIR, 'trial')
    await fs.ensureDir(trialDir)
    fileName = `trial/${voiceName}.wav`
    filePath = path.join(trialDir, `${voiceName}.wav`)
  } else {
    await fs.ensureDir(QWEN_TTS_OUTPUT_DIR)
  }

  await fs.writeFile(filePath, audioBuffer)

  return fileName
}
