import { rpcData } from '@/client/service/http'
import type {
  OrganizeItemStatus,
  OrganizePrepareParams,
} from '@/shared/eagle/organize'
import type { InferRequestType } from 'hono/client'
import { eagleRpc } from '../rpc'

const client = eagleRpc.organize
export type OrganizeSortParams = OrganizePrepareParams

export const fetchOrganizeStatus = () => rpcData(client.status.$get())
export const fetchOrganizePrepare = (params: OrganizeSortParams) =>
  rpcData(client.prepare.$get({ query: params }))
export const fetchOrganizeTask = () => rpcData(client.task.$get())

export const createOrganizeTask = async (
  params: InferRequestType<typeof client.task.$post>['json'],
): Promise<void> => {
  await rpcData(client.task.$post({ json: params }))
}

export const appendOrganizeTask = async (
  params: InferRequestType<typeof client.task.append.$post>['json'],
): Promise<void> => {
  await rpcData(client.task.append.$post({ json: params }))
}

export const fetchFailedOrganizeItems = () =>
  rpcData(client['failed-items'].$get())

export const skipFailedOrganizeItems = async (
  taskId: string,
): Promise<void> => {
  await rpcData(client.task['skip-failed'].$post({ json: { taskId } }))
}
export const pauseOrganizeTask = async (taskId: string): Promise<void> => {
  await rpcData(client.task.pause.$post({ json: { taskId } }))
}
export const resumeOrganizeTask = async (taskId: string): Promise<void> => {
  await rpcData(client.task.resume.$post({ json: { taskId } }))
}
export const syncOrganizeStandards = async (taskId: string): Promise<void> => {
  await rpcData(client.task['sync-standards'].$post({ json: { taskId } }))
}
export const retryFailedOrganizeItems = async (
  taskId: string,
): Promise<void> => {
  await rpcData(client.task['retry-failed'].$post({ json: { taskId } }))
}
export const classifySuccessfulOrganizeItems = async (
  taskId: string,
): Promise<void> => {
  await rpcData(client.task['classify-successful'].$post({ json: { taskId } }))
}
export const clearOrganizeTask = async (taskId: string): Promise<void> => {
  await rpcData(client.task.clear.$post({ json: { taskId } }))
}

export const fetchOrganizeQueue = (limit = 20) =>
  rpcData(client.queue.$get({ query: { limit: String(limit) } }))

export const fetchOrganizeResults = (
  status?: OrganizeItemStatus,
  options?: { limit?: number },
) =>
  rpcData(
    client.results.$get({
      query: {
        status,
        limit: options?.limit === undefined ? undefined : String(options.limit),
      },
    }),
  )

export const fetchOrganizeResultChanges = (
  query: InferRequestType<typeof client.results.changes.$get>['query'] = {},
) => rpcData(client.results.changes.$get({ query }))

export const reconcileOrganizeResults = async (
  taskId: string,
): Promise<void> => {
  await rpcData(client.results.reconcile.$post({ json: { taskId } }))
}

export const fetchOrganizeResult = (itemId: string) =>
  rpcData(client.results[':itemId'].$get({ param: { itemId } }))

export const confirmOrganizeResult = async (
  itemId: string,
  params: InferRequestType<
    (typeof client.results)[':itemId']['confirm']['$post']
  >['json'],
): Promise<void> => {
  await rpcData(
    client.results[':itemId'].confirm.$post({
      param: { itemId },
      json: params,
    }),
  )
}

export type OrganizeBatchConfirmItem = InferRequestType<
  (typeof client.results)['confirm-batch']['$post']
>['json']['items'][number]

export const confirmOrganizeResultsBatch = (
  items: OrganizeBatchConfirmItem[],
  taskId: string,
) => rpcData(client.results['confirm-batch'].$post({ json: { items, taskId } }))

export const skipOrganizeResult = async (
  itemId: string,
  taskId: string,
): Promise<void> => {
  await rpcData(
    client.results[':itemId'].skip.$post({
      param: { itemId },
      json: { taskId },
    }),
  )
}
export const clearOrganizeResultClassification = async (
  itemId: string,
  taskId: string,
): Promise<void> => {
  await rpcData(
    client.results[':itemId']['clear-classification'].$post({
      param: { itemId },
      json: { taskId },
    }),
  )
}
export const retryOrganizeResult = async (
  itemId: string,
  taskId: string,
): Promise<void> => {
  await rpcData(
    client.results[':itemId'].retry.$post({
      param: { itemId },
      json: { taskId },
    }),
  )
}

/** 确认页删除与跳过是同一任务命令，服务端先校验任务再写库。 */
export const trashOrganizeResult = (itemId: string, taskId: string) =>
  rpcData(
    client.results[':itemId'].trash.$post({
      param: { itemId },
      json: { taskId },
    }),
  )
