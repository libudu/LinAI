import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import wanApi from './api/wan'
import geminiApi from './api/gemini'
import taskApi from './api/task'
import templateApi from './api/template'
import logApi from './api/log'

const app = new Hono()

const routes = app
  .route('/api/wan', wanApi)
  .route('/api/gemini', geminiApi)
  .route('/api/task', taskApi)
  .route('/api/template', templateApi)
  .route('/api/log', logApi)
export type AppType = typeof routes

const port = 3000

if (process.env.NODE_ENV !== 'development') {
  // Production serving of static files
  app.use('/*', serveStatic({ root: './dist' }))
}

serve(
  {
    fetch: app.fetch,
    port: port
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`)
  }
)

export default app
