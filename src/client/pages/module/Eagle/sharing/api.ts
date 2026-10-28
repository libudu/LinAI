import { rpcData } from '@/client/service/http'
import { eagleRpc } from '../rpc'

const rpc = eagleRpc.sharing
export const fetchSharingStatus = () => rpcData(rpc.status.$get())
export type SharingStatus = Awaited<ReturnType<typeof fetchSharingStatus>>
export const pickDirectory = (path?: string, signal?: AbortSignal) =>
  rpcData(rpc['pick-directory'].$post({ json: { path } }, { init: { signal } }))
export const validateDirectory = (path: string, allowEmpty = true) =>
  rpcData(rpc['validate-directory'].$post({ json: { path, allowEmpty } }))

export const fetchFolderDownloadStatuses = () =>
  rpcData(rpc.downloads.folders.$get())
export const prepareFolderDownload = (folderId: string) =>
  rpcData(rpc.downloads.prepare.$post({ json: { folderId } }))
export const startFolderDownload = (id: string) =>
  rpcData(rpc.downloads.start.$post({ json: { id } }))
export const fetchDownloadLogs = (groupId: string, userId: string) =>
  rpcData(rpc.downloads.logs.$get({ query: { groupId, userId } }))
