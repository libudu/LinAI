import fs from 'fs-extra'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import wav from 'wav'
import { getYunwuApiKey } from '../../common/config'
import { GEMINI_TTS_OUTPUT_DIR } from './constants'

export interface GeminiTTSResponse {
  candidates?: {
    content?: {
      role?: string
      parts?: {
        inlineData?: {
          mimeType?: string
          data?: string
        }
      }[]
    }
    finishReason?: string
  }[]
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
    totalTokenCount?: number
    trafficType?: string
    promptTokensDetails?: {
      modality?: string
      tokenCount?: number
    }[]
    candidatesTokensDetails?: {
      modality?: string
      tokenCount?: number
    }[]
  }
  modelVersion?: string
  createTime?: string
  responseId?: string
  error?: {
    message: string
  }
}

async function saveWav(
  filename: string,
  pcmData: Buffer,
  channels = 1,
  rate = 24000,
  sampleWidth = 2,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const writer = new wav.FileWriter(filename, {
      channels,
      sampleRate: rate,
      bitDepth: sampleWidth * 8,
    })

    writer.on('finish', resolve)
    writer.on('error', reject)

    writer.write(pcmData)
    writer.end()
  })
}

export const generateAndSaveAudio = async ({
  prompt,
  voiceName,
  isTrial = false,
}: {
  prompt: string
  voiceName: string
  isTrial?: boolean
}): Promise<string> => {
  const MODEL_NAME = 'gemini-3.1-flash-tts-preview'
  const apiKey = getYunwuApiKey()
  const response = await fetch(
    `https://yunwu.ai/v1beta/models/${MODEL_NAME}:generateContent`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName,
              },
            },
          },
          temperature: 0,
        },
      }),
    },
  )
  const res: GeminiTTSResponse = await response.json()
  if (res.error) {
    throw new Error(res.error.message)
  }
  const part = res.candidates?.[0]?.content?.parts?.[0]
  if (!part || !part.inlineData || !part.inlineData.data) {
    throw new Error('No audio data returned from Gemini')
  }

  const audioBase64 = part.inlineData.data

  let fileName = `${uuidv4()}.wav`
  let filePath = path.join(GEMINI_TTS_OUTPUT_DIR, fileName)

  if (isTrial) {
    const trialDir = path.join(GEMINI_TTS_OUTPUT_DIR, 'trial')
    await fs.ensureDir(trialDir)
    fileName = `trial/${voiceName}.wav`
    filePath = path.join(trialDir, `${voiceName}.wav`)
  } else {
    await fs.ensureDir(GEMINI_TTS_OUTPUT_DIR)
  }

  await saveWav(filePath, Buffer.from(audioBase64, 'base64'))

  return fileName
}
