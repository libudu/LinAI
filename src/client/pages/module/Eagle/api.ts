import { rpcData } from '@/client/service/http'
import type { InferRequestType } from 'hono/client'
import { eagleRpc } from './rpc'

export const fetchEagleOverview = () => rpcData(eagleRpc.overview.$get())

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

export const restoreEagleItem = async (id: string): Promise<void> => {
  await rpcData(eagleRpc.items[':id'].restore.$post({ param: { id } }))
}

export const purgeEagleItem = async (id: string): Promise<void> => {
  await rpcData(eagleRpc.items[':id'].purge.$delete({ param: { id } }))
}

export const purgeEagleTrash = () => rpcData(eagleRpc.trash.purge.$post())
export const trashAllUnclassifiedEagleItems = () =>
  rpcData(eagleRpc.unclassified.trash.$post())

export const eagleThumbnailUrl = (id: string) =>
  eagleRpc.items[':id'].thumbnail.$path({ param: { id } })
export const eagleFileUrl = (id: string) =>
  eagleRpc.items[':id'].file.$path({ param: { id } })

export const addEagleItemToGallery = async (id: string): Promise<string> => {
  const data = await rpcData(
    eagleRpc.items[':id']['add-to-gallery'].$post({ param: { id } }),
  )
  return data.url
}
