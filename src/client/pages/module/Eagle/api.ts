import { rpcData } from '@/client/service/http'
import type { EagleMediaType } from '@/shared/eagle/types'
import type { InferRequestType } from 'hono/client'
import { eagleRpc } from './rpc'

export const fetchEagleOverview = (mediaType: EagleMediaType) =>
  rpcData(eagleRpc.overview.$get({ query: { mediaType } }))

export type FetchEagleItemsParams = Omit<
  InferRequestType<typeof eagleRpc.items.$get>['query'],
  'offset' | 'limit'
> & {
  offset: number
  limit: number
}

export const fetchEagleItems = (params: FetchEagleItemsParams) =>
  rpcData(
    eagleRpc.items.$get({
      query: {
        ...params,
        offset: String(params.offset),
        limit: String(params.limit),
      },
    }),
  )

export const refreshEagleIndex = async (): Promise<void> => {
  await rpcData(eagleRpc.refresh.$post())
}

export const updateEagleFolder = async (
  id: string,
  patch: InferRequestType<(typeof eagleRpc.folders)[':id']['$put']>['json'],
): Promise<void> => {
  await rpcData(eagleRpc.folders[':id'].$put({ param: { id }, json: patch }))
}

export const updateEagleItem = async (
  id: string,
  patch: InferRequestType<(typeof eagleRpc.items)[':id']['$put']>['json'],
): Promise<void> => {
  await rpcData(eagleRpc.items[':id'].$put({ param: { id }, json: patch }))
}

export const deleteEagleItem = async (id: string): Promise<void> => {
  await rpcData(eagleRpc.items[':id'].$delete({ param: { id } }))
}

export const fetchEagleItemDetail = (id: string) =>
  rpcData(eagleRpc.items[':id'].detail.$get({ param: { id } }))

export type SaveEagleItemMediaEditsParams = InferRequestType<
  (typeof eagleRpc.items)[':id']['media-edits']['$post']
>['json']

export const saveEagleItemMediaEdits = (
  id: string,
  json: SaveEagleItemMediaEditsParams,
) =>
  rpcData(eagleRpc.items[':id']['media-edits'].$post({ param: { id }, json }))

export const startEagleMediaEditSaveJob = (
  id: string,
  json: InferRequestType<
    (typeof eagleRpc.items)[':id']['media-edits']['jobs']['$post']
  >['json'],
) =>
  rpcData(
    eagleRpc.items[':id']['media-edits'].jobs.$post({ param: { id }, json }),
  )

export const fetchEagleMediaEditSaveJob = (id: string, jobId: string) =>
  rpcData(
    eagleRpc.items[':id']['media-edits'].jobs[':jobId'].$get({
      param: { id, jobId },
    }),
  )

export const cancelEagleMediaEditSaveJob = (id: string, jobId: string) =>
  rpcData(
    eagleRpc.items[':id']['media-edits'].jobs[':jobId'].cancel.$post({
      param: { id, jobId },
    }),
  )

export const restoreEagleItem = async (id: string): Promise<void> => {
  await rpcData(eagleRpc.items[':id'].restore.$post({ param: { id } }))
}

export const purgeEagleItem = async (id: string): Promise<void> => {
  await rpcData(eagleRpc.items[':id'].purge.$delete({ param: { id } }))
}

export const purgeEagleTrash = (mediaType: EagleMediaType) =>
  rpcData(eagleRpc.trash.purge.$post({ query: { mediaType } }))
export const trashAllUnclassifiedEagleItems = (mediaType: EagleMediaType) =>
  rpcData(eagleRpc.unclassified.trash.$post({ query: { mediaType } }))

export const eagleThumbnailUrl = (id: string, version?: string) =>
  `${eagleRpc.items[':id'].thumbnail.$path({ param: { id } })}${version ? `?v=${version}` : ''}`
export const eagleFileUrl = (id: string, version?: string) =>
  `${eagleRpc.items[':id'].file.$path({ param: { id } })}${version ? `?v=${version}` : ''}`
export const eaglePreviewUrl = (id: string, version?: string) =>
  `${eagleRpc.items[':id'].preview.$path({ param: { id } })}${version ? `?v=${version}` : ''}`
export const eagleVideoContactSheetUrl = (id: string) =>
  eagleRpc.items[':id']['video-contact-sheet'].$path({ param: { id } })

export const fetchConversionCandidates = (
  offset = 0,
  limit = 50,
  snapshot = false,
) =>
  rpcData(
    eagleRpc.conversion.candidates.$get({
      query: {
        offset: String(offset),
        limit: String(limit),
        snapshot: String(snapshot) as 'true' | 'false',
      },
    }),
  )

export const convertEagleHeif = (id: string, libraryId: string) =>
  rpcData(
    eagleRpc.conversion.items[':id'].$post({
      param: { id },
      json: { libraryId },
    }),
  )

export const addEagleItemToGallery = async (id: string): Promise<string> => {
  const data = await rpcData(
    eagleRpc.items[':id']['add-to-gallery'].$post({ param: { id } }),
  )
  return data.url
}
