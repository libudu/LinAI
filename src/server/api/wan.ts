import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { WanxBot } from '../module/wan-downloader/index'

const bot = new WanxBot()

const wanApi = new Hono()
  .get('/status', async (c) => {
    return c.json(await bot.getStatus())
  })
  .post('/login', async (c) => {
    try {
      await bot.login()
      return c.json({ success: true })
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500)
    }
  })
  .post(
    '/auto-submit',
    zValidator('json', z.object({ enable: z.boolean() })),
    async (c) => {
      const { enable } = c.req.valid('json')

      if (enable) {
        bot.start().catch(console.error)
      } else {
        bot.stop()
      }

      return c.json({ success: true, isRunning: enable })
    },
  )

export default wanApi
