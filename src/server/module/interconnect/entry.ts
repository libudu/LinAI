import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { HTTPException } from 'hono/http-exception'
import { createServer, type Server } from 'node:https'
import { generate } from 'selfsigned'
import { ZodError } from 'zod'
import sharingApi from '../../api/eagle/sharing'
import { validate } from '../../api/eagle/validation'
import { isEagleSharingProtocol } from '../eagle/sharing/protocol'
import { SHARING_PORT } from './core'
import {
  memberLoginSchema,
  type MemberLogin,
  type Participant,
} from './members'

const MEMBER_LOGIN_PATH = '/api/interconnect/member/login'

/** 只挂载成员登记和共享协议，绝不调用主 app.fetch，无本地管理入口。 */
export async function openSharingEntry(options: {
  login: (secret: string, member: MemberLogin) => Promise<Participant[]>
}) {
  const identity = await generate(
    [{ name: 'commonName', value: 'localhost' }],
    {
      algorithm: 'sha256',
      keySize: 2048,
    },
  )
  const app = new Hono()
    .use('*', async (c, next) => {
      if (
        !isEagleSharingProtocol(c.req.method, c.req.path) &&
        !(c.req.method === 'POST' && c.req.path === MEMBER_LOGIN_PATH)
      )
        return c.json(
          {
            success: false as const,
            error: { message: '此端口只提供房间成员登记及 Eagle 只读共享协议' },
          },
          403,
        )
      c.header('Cache-Control', 'no-store')
      await next()
    })
    .use('*', bodyLimit({ maxSize: 4096 }))
    .post(MEMBER_LOGIN_PATH, validate('json', memberLoginSchema), async (c) => {
      const authorization = c.req.header('Authorization') ?? ''
      if (!/^Bearer [a-f0-9]{64}$/.test(authorization))
        throw new HTTPException(403, { message: '缺少有效的房间邀请凭据' })
      return c.json({
        success: true as const,
        data: await options.login(authorization.slice(7), c.req.valid('json')),
      })
    })
    .route('/api/eagle/sharing', sharingApi)
  app.onError((error, c) =>
    c.json(
      {
        success: false as const,
        error: {
          message:
            error instanceof HTTPException
              ? error.message
              : error instanceof ZodError
                ? '房间请求格式不正确'
                : '房间请求处理失败',
        },
      },
      error instanceof HTTPException
        ? error.status
        : error instanceof ZodError
          ? 400
          : 500,
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
