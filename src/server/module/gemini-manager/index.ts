import { GoogleGenAI } from '@google/genai'
import { logger } from '../utils/logger'

export class GeminiManager {
  private static instance: GeminiManager

  private constructor() { }

  public static getInstance(): GeminiManager {
    if (!GeminiManager.instance) {
      GeminiManager.instance = new GeminiManager()
    }
    return GeminiManager.instance
  }

  public async generateImage(apiKey: string, prompt: string, aspectRatio: string) {
    logger.info('Generating image with Gemini')
    try {
      const ai = new GoogleGenAI({ apiKey })

      let mappedAspectRatio = '1:1'
      if (aspectRatio === '16:9') mappedAspectRatio = '16:9'
      else if (aspectRatio === '9:16') mappedAspectRatio = '9:16'
      else if (aspectRatio === '4:3') mappedAspectRatio = '4:3'
      else if (aspectRatio === '3:4') mappedAspectRatio = '3:4'

      const response = await ai.models.generateImages({
        model: 'gemini-3.1-flash-image-preview',
        prompt: prompt,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/jpeg',
          aspectRatio: mappedAspectRatio as any
        }
      })

      if (response.generatedImages && response.generatedImages.length > 0) {
        const imageBase64 = response.generatedImages[0].image?.imageBytes
        if (!imageBase64) {
          throw new Error('No image bytes returned')
        }
        return {
          success: true,
          image: `data:image/jpeg;base64,${imageBase64}`
        }
      }

      throw new Error('No image generated')
    } catch (error) {
      logger.error('Failed to generate image', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }
}

export const geminiManager = GeminiManager.getInstance()
