import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import * as path from 'path'
import configApi from './api/common/config'
import logApi from './api/common/log'
import staticApi from './api/common/static'
import taskApi from './api/common/task'
import templateApi from './api/common/template'
import geminiApi from './api/gemini'
import gptImageApi from './api/gpt-image'
import wanApi from './api/wan'

const app = new Hono()

const routes = app
  // module
  .route('/api/wan', wanApi)
  .route('/api/gemini', geminiApi)
  .route('/api/gptImage', gptImageApi)
  // common
  .route('/api/task', taskApi)
  .route('/api/template', templateApi)
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
