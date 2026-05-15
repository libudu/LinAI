import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import {
  generateAndSaveAudioInworld,
  listInworldVoices,
} from '../module/tts/index'

const ttsInworldApi = new Hono()
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
          url: `/api/tts/output/inworld/${filename}?t=${Date.now()}`,
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
