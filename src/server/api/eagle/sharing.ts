import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { getItemDetail } from '../../module/eagle/library'
import type { EagleLibraryAccess } from '../../module/eagle/library/shared-access'
import { getEagleFolderSharingSettings } from '../../module/eagle/settings'
import { issueOwnerSession } from '../../module/eagle/sharing/access'
import {
  listDirectories,
  validateLibraryDirectory,
} from '../../module/eagle/sharing/paths'
import { isSharedRead } from '../../module/eagle/sharing/protocol'
import {
  authorizeRead,
  closeIncoming,
  heartbeatIncoming,
  recordTransfer,
  requestSharing,
  sharingSnapshot,
} from '../../module/eagle/sharing/service'
import { bindSharedResponse } from '../../module/eagle/sharing/transport'
import libraryApi from './library'
import { validate } from './validation'

const bearer = (authorization?: string) => {
  if (!authorization || !/^Bearer [a-f0-9]{64}$/.test(authorization))
    throw new HTTPException(403, { message: '缺少有效的共享凭据' })
  return authorization.slice(7)
}

const sharingApi = new Hono()
  .use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store')
    await next()
  })
  .get('/local-session', (c) => issueOwnerSession(c))
  .get('/events', (c) => {
    return streamSSE(c, async (stream) => {
      while (!stream.aborted) {
        await stream.writeSSE({
          event: 'status',
          data: JSON.stringify(sharingSnapshot()),
        })
        await stream.sleep(1000)
      }
    })
  })
  .get('/status', (c) =>
    c.json({
      success: true as const,
      data: sharingSnapshot(),
    }),
  )
  .get(
    '/directories',
    validate('query', z.object({ path: z.string().optional() })),
    async (c) =>
      c.json({
        success: true as const,
        data: await listDirectories(c.req.valid('query').path),
      }),
  )
  .post(
    '/validate-directory',
    validate(
      'json',
      z.object({
        path: z.string().min(1),
        allowEmpty: z.boolean().default(true),
      }),
    ),
    async (c) => {
      const { path, allowEmpty } = c.req.valid('json')
      return c.json({
        success: true as const,
        data: await validateLibraryDirectory(path, allowEmpty),
      })
    },
  )
  // 以下为双方服务端之间的共享协议，只接受会话凭据，不复用本地管理接口。
  .post(
    '/request',
    validate(
      'json',
      z.object({
        invitationCode: z.string().regex(/^[a-f0-9]{64}$/),
        instanceId: z.string().uuid(),
      }),
    ),
    async (c) => {
      const { invitationCode, instanceId } = c.req.valid('json')
      return c.json({
        success: true as const,
        data: await requestSharing(invitationCode, instanceId),
      })
    },
  )
  .post('/session/heartbeat', async (c) =>
    c.json({
      success: true as const,
      data: await heartbeatIncoming(bearer(c.req.header('authorization'))),
    }),
  )
  .post('/session/close', (c) => {
    closeIncoming(bearer(c.req.header('authorization')))
    return c.json({ success: true as const, data: null })
  })
  .get('/library/*', async (c) => {
    const path = c.req.path.split('/sharing/library')[1] || '/'
    if (!isSharedRead(path))
      throw new HTTPException(403, { message: '此接口不允许共享访问' })
    const session = await authorizeRead(bearer(c.req.header('authorization')))
    const readSignal = session.readController.signal
    const permissions = await getEagleFolderSharingSettings()
    const library = permissions.value.libraries.find(
      (entry) => entry.libraryPath === session.libraryPath,
    )
    const access: EagleLibraryAccess = {
      libraryPath: session.libraryPath,
      selectionVersion: library?.selectionVersion ?? 1,
      grantedFolderIds: [
        ...new Set([
          ...(library?.everyone ?? []),
          ...(library?.users[session.folderSharingCode] ?? []),
        ]),
      ].sort(),
    }
    const url = new URL(c.req.url)
    url.pathname = path
    const headers = new Headers()
    const range = c.req.header('range')
    if (range) headers.set('Range', range)
    const signal = AbortSignal.any([
      c.req.raw.signal,
      session.controller.signal,
      readSignal,
    ])
    const response = await libraryApi.fetch(
      new Request(url, { headers, signal }),
      { eagleSharingAccess: access },
    )
    // 索引读取期间可能已经撤销授权或切库，再检查一次。
    try {
      await authorizeRead(bearer(c.req.header('authorization')))
      if (signal.aborted)
        throw new HTTPException(409, { message: '共享权限已改变，请重新加载' })
      const itemId = /^\/items\/([A-Za-z0-9]+)\//.exec(path)?.[1]
      if (itemId && !(await getItemDetail(itemId, access)))
        throw new HTTPException(404, { message: '条目不存在或未共享' })
    } catch (error) {
      await response.body?.cancel()
      throw error
    }
    return bindSharedResponse(response, signal, (bytes) =>
      recordTransfer(session, bytes),
    )
  })

export default sharingApi
