import { rpcData } from '@/client/service/http'
import { eaglePageId, eagleRpc } from '../rpc'

const rpc = eagleRpc.sharing
export const fetchSharingStatus = () =>
  rpcData(rpc.status.$get({ query: { pageId: eaglePageId } }))
export type SharingStatus = Awaited<ReturnType<typeof fetchSharingStatus>>
export const decideSharing = (id: string, approve: boolean) =>
  rpcData(rpc.decision.$post({ json: { pageId: eaglePageId, id, approve } }))
export const connectRemoteLibrary = (config: {
  url: string
  localPath: string
  invitationCode: string
}) => rpcData(rpc.connect.$post({ json: { pageId: eaglePageId, ...config } }))
export const disconnectRemoteLibrary = () =>
  rpcData(rpc.disconnect.$post({ json: { pageId: eaglePageId } }))
export const fetchDirectories = (path?: string) =>
  rpcData(rpc.directories.$get({ query: { path } }))
export const validateDirectory = (path: string, allowEmpty = true) =>
  rpcData(rpc['validate-directory'].$post({ json: { path, allowEmpty } }))
