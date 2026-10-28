import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { HTTPException } from 'hono/http-exception'
import { createServer, type Server } from 'node:https'
import { generate } from 'selfsigned'
import sharingApi from '../../api/eagle/sharing'
import { isEagleSharingProtocol } from '../eagle/sharing/protocol'
import { SHARING_PORT } from './core'

/** 只挂载共享协议，绝不调用主 app.fetch；即使 no-tun 将来源映射到回环也无管理入口。 */
export async function openSharingEntry() {
  const identity = await generate(
    [{ name: 'commonName', value: 'localhost' }],
    {
      algorithm: 'sha256',
      keySize: 2048,
    },
  )
  const app = new Hono()
    .use('*', async (c, next) => {
      if (!isEagleSharingProtocol(c.req.method, c.req.path))
        return c.json(
          {
            success: false as const,
            error: { message: '此端口只提供 Eagle 只读共享协议' },
          },
          403,
        )
      c.header('Cache-Control', 'no-store')
      await next()
    })
    .use('*', bodyLimit({ maxSize: 4096 }))
    .route('/api/eagle/sharing', sharingApi)
  app.onError((error, c) =>
    c.json(
      {
        success: false as const,
        error: {
          message:
            error instanceof HTTPException ? error.message : '共享资源处理失败',
        },
      },
      error instanceof HTTPException ? error.status : 500,
    ),
  )
  return new Promise<{ server: Server; certificate: string }>(
    (resolve, reject) => {
      const server = serve(
        {
          fetch: app.fetch,
          port: SHARING_PORT,
          hostname: '127.0.0.1',
          createServer,
          serverOptions: {
            key: identity.private,
            cert: identity.cert,
            minVersion: 'TLSv1.2',
          },
        },
        () => resolve({ server, certificate: identity.cert }),
      ) as Server
      server.once('error', reject)
    },
  )
}
