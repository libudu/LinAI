import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import {
  generateAndSaveAudioInworld,
  listInworldVoices,
} from '../../module/tts/index'
import { getTTSConfig, updateTTSConfig } from '../../module/tts/config'

const ttsInworldApi = new Hono()
  // TTS 模块配置（独立存储 data/tts/config.json）
  .get('/config', (c) => {
    return c.json({ success: true as const, data: getTTSConfig() })
  })
  .post(
    '/config',
    zValidator(
      'json',
      z.object({
        ttsInworldApiKey: z.string().nullable().optional(),
      }),
    ),
    (c) => {
      return c.json({
        success: true as const,
        data: updateTTSConfig(c.req.valid('json')),
      })
    },
  )
  .post(
    '/generate',
    zValidator(
      'json',
      z.object({
        text: z.string(),
        voiceId: z.string(),
      }),
    ),
    async (c) => {
      try {
        const { text, voiceId } = c.req.valid('json')
        const filename = await generateAndSaveAudioInworld({
          text,
          voiceId,
        })
        return c.json({
          success: true,
          url: `/api/tts/output/${filename}?t=${Date.now()}`,
        })
      } catch (error: any) {
        return c.json({ success: false, error: error.message }, 500)
      }
    },
  )
  .get('/voices', async (c) => {
    try {
      const voices = await listInworldVoices()
      return c.json({ success: true, data: voices })
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500)
    }
  })

export default ttsInworldApi
