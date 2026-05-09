import { zValidator } from '@hono/zod-validator'
import fs from 'fs-extra'
import { Hono } from 'hono'
import path from 'path'
import { z } from 'zod'
import { generateAndSaveAudio } from '../module/gemini-tts/index'
import { GEMINI_TTS_OUTPUT_DIR } from '../module/gemini-tts/constants'

const geminiTtsApi = new Hono()
    .post(
        '/generate',
        zValidator('json', z.object({ prompt: z.string() })),
        async (c) => {
            try {
                const { prompt } = c.req.valid('json')
                const filename = await generateAndSaveAudio(prompt)
                return c.json({ success: true, url: `/api/gemini-tts/output/${filename}` })
            } catch (error: any) {
                return c.json({ success: false, error: error.message }, 500)
            }
        }
    )
    .get(
        '/output/:filename',
        zValidator('param', z.object({ filename: z.string() })),
        async (c) => {
            const { filename } = c.req.valid('param')
            const filepath = path.join(GEMINI_TTS_OUTPUT_DIR, filename)

            if (await fs.pathExists(filepath)) {
                const file = await fs.readFile(filepath)
                c.header('Content-Type', 'audio/wav')
                return c.body(file)
            }
            return c.notFound()
        }
    )

export default geminiTtsApi
