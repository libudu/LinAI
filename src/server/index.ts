import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import dotenv from 'dotenv'
import { Hono } from 'hono'
import * as path from 'path'
import { ZodError } from 'zod'
import configApi from './api/common/config'
import logApi from './api/common/log'
import relayApi from './api/common/relay'
import settingsApi from './api/common/settings'
import staticApi from './api/common/static'
import storageApi from './api/common/storage'
import taskApi from './api/common/task'
import gptImageApi from './api/gpt-image'
import ttsApi from './api/tts'
import ttsInworldApi from './api/tts/inworld'
import yunwuTokenApi from './api/yunwu-token'
import { StorageError } from './common/storage/errors'

dotenv.config()

const app = new Hono()

// 统一错误响应：存储层错误按 code 映射状态码，其余未捕获错误返回 500，
// 写入失败等异常必须让接口失败，禁止静默吞错
app.onError((err, c) => {
  if (err instanceof StorageError) {
    const status =
      err.code === 'NOT_FOUND'
        ? 404
        : err.code === 'REVISION_CONFLICT'
          ? 409
          : err.code === 'INVALID_RESOURCE'
            ? 404
            : err.code === 'PAYLOAD_TOO_LARGE'
              ? 413
              : 500
    return c.json(
      {
        success: false as const,
        error: { code: err.code, message: err.message, ...err.details },
      },
      status,
    )
  }
  // 设置 schema 校验失败等客户端输入问题返回 400
  if (err instanceof ZodError) {
    return c.json(
      {
        success: false as const,
        error: { code: 'VALIDATION_FAILED', message: err.message },
      },
      400,
    )
  }
  console.error('[Server] 未处理错误', err)
  return c.json(
    {
      success: false as const,
      error: { code: 'INTERNAL_ERROR', message: err.message },
    },
    500,
  )
})

const routes = app
  // module
  .route('/api/tts', ttsApi)
  .route('/api/tts-inworld', ttsInworldApi)
  .route('/api/gptImage', gptImageApi)
  .route('/api/gptImage', yunwuTokenApi)
  // common
  .route('/api/task', taskApi)
  .route('/api/storage', storageApi)
  .route('/api/settings', settingsApi)
  .route('/api/relay', relayApi)
  .route('/api/log', logApi)
  .route('/api/static', staticApi)
  .route('/api/config', configApi)
export type AppType = typeof routes

export const BACKEND_PORT = process.env.NODE_ENV !== 'development' ? 3000 : 3001

if (process.env.NODE_ENV !== 'development') {
  // Production serving of static files
  const clientPath = path.resolve(__dirname, '../client')
  app.use('/*', serveStatic({ root: clientPath }))
}

serve(
  {
    fetch: app.fetch,
    port: BACKEND_PORT,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`)
    if (process.env.NODE_ENV === 'production') {
      const url = `http://localhost:${info.port}`
      const { exec } = require('child_process')
      const start =
        process.platform == 'darwin'
          ? 'open'
          : process.platform == 'win32'
            ? 'start'
            : 'xdg-open'
      exec(`${start} ${url}`)
    }
  },
)

export default app
