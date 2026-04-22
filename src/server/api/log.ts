import { Hono } from 'hono'
import { handleLogSSE } from './utils'
import { logger } from '../module/utils/logger'

const logApi = new Hono()

logApi.get('/:moduleId', (c) => handleLogSSE(c, logger))

logApi.delete('/:moduleId', (c) => {
  logger.clearLogs()
  return c.json({ success: true as const })
})

export default logApi
