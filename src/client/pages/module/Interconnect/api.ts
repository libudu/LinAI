import { rpcData } from '@/client/service/http'
import type { AppType } from '@/server'
import { hc } from 'hono/client'
import { ensureEagleOwnerSession } from '../Eagle/sharing/access'

const rpc = hc<AppType>('/', {
  fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
    await ensureEagleOwnerSession()
    return fetch(input, init)
  },
}).api.interconnect

export const fetchRoomStatus = () => rpcData(rpc.status.$get())
export type RoomStatus = Awaited<ReturnType<typeof fetchRoomStatus>>
export const createRoom = (name: string, memberName: string) =>
  rpcData(rpc.create.$post({ json: { name, memberName } }))
export const joinRoom = (invitation: string, name: string) =>
  rpcData(rpc.join.$post({ json: { invitation, name } }))
export const leaveRoom = () => rpcData(rpc.leave.$post())
export const saveMember = (name: string, id?: string) =>
  rpcData(rpc.members.$post({ json: { name, id } }))
export const inviteMember = (id: string) =>
  rpcData(rpc.invite.$post({ json: { id } }))
export const revokeMember = (id: string) =>
  rpcData(rpc.revoke.$post({ json: { id } }))
export const deleteMember = (id: string) =>
  rpcData(rpc['delete-member'].$post({ json: { id } }))
export const deleteMemberHistory = (groupId: string, userId: string) =>
  rpcData(rpc['delete-member-history'].$post({ json: { groupId, userId } }))
export const selectRemoteLibrary = () => rpcData(rpc.eagle.$post())
