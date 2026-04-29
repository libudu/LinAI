import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { logger } from '../../module/utils/logger'

const logApi = new Hono()
  .get(
    '/:moduleId',
    zValidator('param', z.object({ moduleId: z.string() })),
    (c) => {
      return streamSSE(c, async (stream) => {
        // 发送初始日志
        const initialLogs = logger.getLogs(100)
        for (const log of initialLogs) {
          await stream.writeSSE({
            data: log,
            event: 'log',
          })
        }

        // 监听新日志
        const onLog = async (message: string) => {
          try {
            await stream.writeSSE({
              data: message,
              event: 'log',
            })
          } catch (e) {
            // 流可能已关闭
            logger.removeListener('log', onLog)
          }
        }

        logger.on('log', onLog)

        c.req.raw.signal.addEventListener('abort', () => {
          logger.removeListener('log', onLog)
        })

        // 保持连接
        while (true) {
          await new Promise((resolve) => setTimeout(resolve, 30000))
          await stream.writeSSE({ data: 'ping', event: 'ping' })
        }
      })
    },
  )
  .delete(
    '/:moduleId',
    zValidator('param', z.object({ moduleId: z.string() })),
    (c) => {
      logger.clearLogs()
      return c.json({ success: true as const })
    },
  )

export default logApi
