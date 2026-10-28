import { rpcData } from '@/client/service/http'
import { eagleRpc } from '../rpc'

const rpc = eagleRpc.sharing
export const fetchSharingStatus = () => rpcData(rpc.status.$get())
export type SharingStatus = Awaited<ReturnType<typeof fetchSharingStatus>>
export const decideSharing = (id: string, approve: boolean) =>
  rpcData(rpc.decision.$post({ json: { id, approve } }))
export const fetchDirectories = (path?: string) =>
  rpcData(rpc.directories.$get({ query: { path } }))
export const validateDirectory = (path: string, allowEmpty = true) =>
  rpcData(rpc['validate-directory'].$post({ json: { path, allowEmpty } }))
