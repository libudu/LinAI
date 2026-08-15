import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { generateAndSaveAudioInworld } from '../../module/tts/index'

// 模块配置走注册式设置接口（GET/PUT /api/settings/tts）；
// 音色列表与试听为纯代理，走受限请求中继（/api/relay/inworld）；
// 这里只保留带文件副作用的音频生成
const ttsInworldApi = new Hono().post(
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

export default ttsInworldApi
