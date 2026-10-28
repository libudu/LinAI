import { rpcData } from '@/client/service/http'
import { eagleRpc } from '../rpc'

const rpc = eagleRpc.sharing
export const fetchSharingStatus = () => rpcData(rpc.status.$get())
export type SharingStatus = Awaited<ReturnType<typeof fetchSharingStatus>>
export const pickDirectory = (path?: string, signal?: AbortSignal) =>
  rpcData(rpc['pick-directory'].$post({ json: { path } }, { init: { signal } }))
export const validateDirectory = (path: string, allowEmpty = true) =>
  rpcData(rpc['validate-directory'].$post({ json: { path, allowEmpty } }))
