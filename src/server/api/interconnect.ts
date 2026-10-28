import { Hono } from 'hono'
import { z } from 'zod'
import { memberNameSchema } from '../module/interconnect/members'
import {
  createRoom,
  deleteMember,
  inviteMember,
  joinRoom,
  leaveRoom,
  revokeMember,
  roomStatus,
  saveMember,
  selectRemoteLibrary,
} from '../module/interconnect/service'
import { validate } from './eagle/validation'

const idSchema = z.string().regex(/^[A-Za-z0-9]{8}$/)
const api = new Hono()
  .use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store')
    await next()
  })
  .get('/status', async (c) =>
    c.json({ success: true as const, data: await roomStatus() }),
  )
  .post(
    '/create',
    validate('json', z.object({ name: z.string().trim().min(1).max(80) })),
    async (c) => {
      await createRoom(c.req.valid('json').name)
      return c.json({ success: true as const, data: null })
    },
  )
  .post(
    '/join',
    validate(
      'json',
      z.object({ invitation: z.string().max(16020), name: memberNameSchema }),
    ),
    async (c) => {
      const { invitation, name } = c.req.valid('json')
      await joinRoom(invitation, name)
      return c.json({ success: true as const, data: null })
    },
  )
  .post('/leave', async (c) => {
    await leaveRoom()
    return c.json({ success: true as const, data: null })
  })
  .post(
    '/members',
    validate(
      'json',
      z.object({
        name: z.string().trim().min(1).max(80),
        id: idSchema.optional(),
      }),
    ),
    async (c) => {
      const { name, id } = c.req.valid('json')
      await saveMember(name, id)
      return c.json({ success: true as const, data: null })
    },
  )
  .post(
    '/invite',
    validate('json', z.object({ id: idSchema })),
    async (c) => {
      const { id } = c.req.valid('json')
      return c.json({
        success: true as const,
        data: await inviteMember(id),
      })
    },
  )
  .post('/revoke', validate('json', z.object({ id: idSchema })), async (c) => {
    await revokeMember(c.req.valid('json').id)
    return c.json({ success: true as const, data: null })
  })
  .post(
    '/delete-member',
    validate('json', z.object({ id: idSchema })),
    async (c) => {
      await deleteMember(c.req.valid('json').id)
      return c.json({ success: true as const, data: null })
    },
  )
  .post('/eagle', async (c) =>
    c.json({ success: true as const, data: await selectRemoteLibrary() }),
  )

export default api
