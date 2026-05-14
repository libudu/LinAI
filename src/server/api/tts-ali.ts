import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { generateAndSaveAudioQwen, listCustomVoices } from '../module/tts/index'

const ttsAliApi = new Hono()
  .post(
    '/generate',
    zValidator(
      'json',
      z.object({
        prompt: z.string(),
        voiceName: z.string(),
        isTrial: z.boolean().optional(),
      }),
    ),
    async (c) => {
      try {
        const { prompt, voiceName, isTrial } = c.req.valid('json')
        const filename = await generateAndSaveAudioQwen({
          prompt,
          voiceName,
          isTrial,
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
  .get(
    '/voices',
    zValidator(
      'query',
      z.object({
        prefix: z.string().optional(),
      }),
    ),
    async (c) => {
      try {
        const { prefix } = c.req.valid('query')
        const voices = await listCustomVoices(prefix)
        return c.json({ success: true, data: voices })
      } catch (error: any) {
        return c.json({ success: false, error: error.message }, 500)
      }
    },
  )

export default ttsAliApi
