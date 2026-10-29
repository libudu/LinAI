import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { getRequestIdentity } from '../../common/auth/network'
import { pickLibraryDirectory } from '../../module/eagle/directory-picker'
import { getItemDetail } from '../../module/eagle/library'
import type { EagleLibraryAccess } from '../../module/eagle/library/shared-access'
import { eagleMediaQuerySchema } from '../../module/eagle/schemas'
import { getEagleFolderSharingSettings } from '../../module/eagle/settings'
import { issueOwnerSession } from '../../module/eagle/sharing/access'
import {
  getDownloadLogs,
  recordDownloadLog,
} from '../../module/eagle/sharing/download-log'
import {
  downloadProgressSchema,
  downloadSnapshot,
} from '../../module/eagle/sharing/download-state'
import {
  getFolderDownloadStatuses,
  prepareFolderDownload,
  startFolderDownload,
} from '../../module/eagle/sharing/downloads'
import {
  deleteSharingHistory,
  getSharingHistory,
} from '../../module/eagle/sharing/history'
import { validateLibraryDirectory } from '../../module/eagle/sharing/paths'
import { isSharedRead } from '../../module/eagle/sharing/protocol'
import {
  authorizeRead,
  closeIncoming,
  connectRemote,
  decideSharing,
  disconnectRemote,
  heartbeatIncoming,
  recordTransfer,
  requestSharing,
  sharingSnapshot,
} from '../../module/eagle/sharing/service'
import { bindSharedResponse } from '../../module/eagle/sharing/transport'
import {
  getMemberIdentity,
  memberLoginSchema,
  memberNameSchema,
} from '../../module/interconnect/members'
import libraryApi from './library'
import { validate } from './validation'

const bearer = (authorization?: string) => {
  if (!authorization || !/^Bearer [a-f0-9]{64}$/.test(authorization))
    throw new HTTPException(403, { message: '缺少有效的共享凭据' })
  return authorization.slice(7)
}

const statusSnapshot = () => ({
  ...sharingSnapshot(),
  downloads: downloadSnapshot(),
})
const historyQuery = z.object({ groupId: z.string().regex(/^[A-Za-z0-9]{8}$/) })

const sharingApi = new Hono()
  .use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store')
    await next()
  })
  .get('/local-session', (c) => issueOwnerSession(c))
  .get('/identity', async (c) =>
    c.json({ success: true as const, data: await getMemberIdentity() }),
  )
  .get('/history', validate('query', historyQuery), async (c) =>
    c.json({
      success: true as const,
      data: await getSharingHistory(c.req.valid('query').groupId),
    }),
  )
  .post(
    '/history/delete',
    validate('json', historyQuery.extend({ userId: z.string().uuid() })),
    async (c) => {
      const { groupId, userId } = c.req.valid('json')
      await deleteSharingHistory(groupId, userId)
      return c.json({ success: true as const, data: null })
    },
  )
  .get('/events', (c) => {
    return streamSSE(c, async (stream) => {
      while (!stream.aborted) {
        await stream.writeSSE({
          event: 'status',
          data: JSON.stringify(statusSnapshot()),
        })
        await stream.sleep(1000)
      }
    })
  })
  .get('/status', (c) =>
    c.json({
      success: true as const,
      data: statusSnapshot(),
    }),
  )
  .post(
    '/decision',
    validate('json', z.object({ id: z.string().uuid(), approve: z.boolean() })),
    async (c) => {
      const { id, approve } = c.req.valid('json')
      await decideSharing(id, approve)
      return c.json({ success: true as const, data: null })
    },
  )
  .post(
    '/connect',
    validate(
      'json',
      z.object({
        url: z.string().url(),
        invitationCode: z.string().regex(/^[A-Za-z0-9]{8}$/),
        memberName: memberNameSchema.optional(),
      }),
    ),
    async (c) =>
      c.json({
        success: true as const,
        data: await connectRemote(c.req.valid('json')),
      }),
  )
  .post('/disconnect', (c) => {
    disconnectRemote()
    return c.json({ success: true as const, data: null })
  })
  .get(
    '/downloads/folders',
    validate('query', eagleMediaQuerySchema.required()),
    async (c) =>
      c.json({
        success: true as const,
        data: await getFolderDownloadStatuses(c.req.valid('query').mediaType),
      }),
  )
  .post(
    '/downloads/prepare',
    validate(
      'json',
      eagleMediaQuerySchema.required().extend({ folderId: z.string().min(1) }),
    ),
    async (c) => {
      const { folderId, mediaType } = c.req.valid('json')
      return c.json({
        success: true as const,
        data: await prepareFolderDownload(folderId, mediaType),
      })
    },
  )
  .post(
    '/downloads/start',
    validate('json', z.object({ id: z.string().uuid() })),
    async (c) =>
      c.json({
        success: true as const,
        data: await startFolderDownload(c.req.valid('json').id),
      }),
  )
  .get(
    '/downloads/logs',
    validate(
      'query',
      z.object({
        groupId: z.string().regex(/^[A-Za-z0-9]{8}$/),
        userId: z.string().uuid(),
      }),
    ),
    async (c) => {
      const { groupId, userId } = c.req.valid('query')
      return c.json({
        success: true as const,
        data: await getDownloadLogs(groupId, userId),
      })
    },
  )
  .post(
    '/pick-directory',
    validate('json', z.object({ path: z.string().optional() })),
    async (c) =>
      c.json({
        success: true as const,
        data: await pickLibraryDirectory(
          c.req.valid('json').path,
          c.req.raw.signal,
        ),
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
        invitationCode: z.string().regex(/^(?:[A-Za-z0-9]{8}|[a-f0-9]{64})$/),
        instanceId: z.string().uuid(),
        member: memberLoginSchema.optional(),
      }),
    ),
    async (c) => {
      const { invitationCode, instanceId, member } = c.req.valid('json')
      return c.json({
        success: true as const,
        data: await requestSharing(invitationCode, instanceId, {
          member,
          address: (await getRequestIdentity(c)).ip,
        }),
      })
    },
  )
  .post(
    '/session/heartbeat',
    validate(
      'json',
      z.object({
        downloads: z.array(downloadProgressSchema).max(100).optional(),
      }),
    ),
    async (c) =>
      c.json({
        success: true as const,
        data: await heartbeatIncoming(
          bearer(c.req.header('authorization')),
          c.req.valid('json').downloads,
        ),
      }),
  )
  .post('/session/close', (c) => {
    closeIncoming(bearer(c.req.header('authorization')))
    return c.json({ success: true as const, data: null })
  })
  .post(
    '/session/download',
    validate(
      'json',
      z.object({
        folderId: z.string().min(1),
        taskId: z.string().uuid(),
        total: z
          .number()
          .int()
          .positive()
          .max(Number.MAX_SAFE_INTEGER)
          .optional(),
      }),
    ),
    async (c) => {
      const { folderId, taskId, total } = c.req.valid('json')
      await recordDownloadLog(
        bearer(c.req.header('authorization')),
        folderId,
        taskId,
        total,
      )
      return c.json({ success: true as const, data: null })
    },
  )
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
