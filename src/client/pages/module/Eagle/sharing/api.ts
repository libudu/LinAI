import { rpcData } from '@/client/service/http'
import type { EagleMediaType } from '@/shared/eagle/types'
import { eagleRpc } from '../rpc'

const rpc = eagleRpc.sharing
export const fetchSharingStatus = () => rpcData(rpc.status.$get())
export type SharingStatus = Awaited<ReturnType<typeof fetchSharingStatus>>
export const pickDirectory = (path?: string, signal?: AbortSignal) =>
  rpcData(rpc['pick-directory'].$post({ json: { path } }, { init: { signal } }))
export const validateDirectory = (path: string, allowEmpty = true) =>
  rpcData(rpc['validate-directory'].$post({ json: { path, allowEmpty } }))

export const fetchFolderDownloadStatuses = (mediaType: EagleMediaType) =>
  rpcData(rpc.downloads.folders.$get({ query: { mediaType } }))
export const prepareFolderDownload = (
  folderId: string,
  mediaType: EagleMediaType,
) => rpcData(rpc.downloads.prepare.$post({ json: { folderId, mediaType } }))
export const startFolderDownload = (id: string) =>
  rpcData(rpc.downloads.start.$post({ json: { id } }))
export const fetchDownloadLogs = (groupId: string, userId: string) =>
  rpcData(rpc.downloads.logs.$get({ query: { groupId, userId } }))
