import { GoogleGenAI } from '@google/genai'
import fs from 'fs-extra'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { GEMINI_TTS_OUTPUT_DIR } from './constants'

const ai = new GoogleGenAI({})

export const generateAndSaveAudio = async (prompt: string): Promise<string> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-tts-preview',
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  })

  const part = response.candidates?.[0]?.content?.parts?.[0]
  if (!part || !part.inlineData || !part.inlineData.data) {
    throw new Error('No audio data returned from Gemini')
  }

  const audioBase64 = part.inlineData.data

  await fs.ensureDir(GEMINI_TTS_OUTPUT_DIR)

  const fileName = `${uuidv4()}.wav`
  const filePath = path.join(GEMINI_TTS_OUTPUT_DIR, fileName)

  await fs.writeFile(filePath, Buffer.from(audioBase64, 'base64'))

  return fileName
}
