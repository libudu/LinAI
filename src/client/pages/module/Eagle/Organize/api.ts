import { rpcData } from '@/client/service/http'
import type {
  OrganizeItemStatus,
  OrganizePrepareParams,
} from '@/shared/eagle/organize'
import type { EagleMediaType } from '@/shared/eagle/types'
import type { InferRequestType } from 'hono/client'
import { eagleRpc } from '../rpc'
import { useOrganizeMedia } from './media'

export type OrganizeSortParams = OrganizePrepareParams
export type OrganizeBatchConfirmItem = InferRequestType<
  (typeof eagleRpc.organize.image.results)['confirm-batch']['$post']
>['json']['items'][number]

const createOrganizeApi = (mediaType: EagleMediaType) => {
  const client = eagleRpc.organize[mediaType]

  const fetchOrganizeStatus = () => rpcData(client.status.$get())
  const fetchOrganizePrepare = (params: OrganizeSortParams) =>
    rpcData(client.prepare.$get({ query: params }))
  const fetchOrganizeTask = () => rpcData(client.task.$get())

  const createOrganizeTask = async (
    params: InferRequestType<typeof client.task.$post>['json'],
  ): Promise<void> => {
    await rpcData(client.task.$post({ json: params }))
  }

  const appendOrganizeTask = async (
    params: InferRequestType<typeof client.task.append.$post>['json'],
  ): Promise<void> => {
    await rpcData(client.task.append.$post({ json: params }))
  }

  const fetchFailedOrganizeItems = () => rpcData(client['failed-items'].$get())

  const skipFailedOrganizeItems = async (taskId: string): Promise<void> => {
    await rpcData(client.task['skip-failed'].$post({ json: { taskId } }))
  }
  const pauseOrganizeTask = async (taskId: string): Promise<void> => {
    await rpcData(client.task.pause.$post({ json: { taskId } }))
  }
  const resumeOrganizeTask = async (taskId: string): Promise<void> => {
    await rpcData(client.task.resume.$post({ json: { taskId } }))
  }
  const syncOrganizeStandards = async (taskId: string): Promise<void> => {
    await rpcData(client.task['sync-standards'].$post({ json: { taskId } }))
  }
  const retryFailedOrganizeItems = async (taskId: string): Promise<void> => {
    await rpcData(client.task['retry-failed'].$post({ json: { taskId } }))
  }
  const classifySuccessfulOrganizeItems = async (
    taskId: string,
  ): Promise<void> => {
    await rpcData(
      client.task['classify-successful'].$post({ json: { taskId } }),
    )
  }
  const clearOrganizeTask = async (taskId: string): Promise<void> => {
    await rpcData(client.task.clear.$post({ json: { taskId } }))
  }

  const fetchOrganizeQueue = (limit = 20) =>
    rpcData(client.queue.$get({ query: { limit: String(limit) } }))

  const fetchOrganizeResults = (
    status?: OrganizeItemStatus,
    options?: { limit?: number },
  ) =>
    rpcData(
      client.results.$get({
        query: {
          status,
          limit:
            options?.limit === undefined ? undefined : String(options.limit),
        },
      }),
    )

  const fetchOrganizeResultChanges = (
    query: InferRequestType<typeof client.results.changes.$get>['query'] = {},
  ) => rpcData(client.results.changes.$get({ query }))

  const reconcileOrganizeResults = async (taskId: string): Promise<void> => {
    await rpcData(client.results.reconcile.$post({ json: { taskId } }))
  }

  const fetchOrganizeResult = (itemId: string) =>
    rpcData(client.results[':itemId'].$get({ param: { itemId } }))

  const confirmOrganizeResult = async (
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

  const confirmOrganizeResultsBatch = (
    items: OrganizeBatchConfirmItem[],
    taskId: string,
  ) =>
    rpcData(client.results['confirm-batch'].$post({ json: { items, taskId } }))

  const skipOrganizeResult = async (
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
  const clearOrganizeResultClassification = async (
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
  const retryOrganizeResult = async (
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
  const trashOrganizeResult = (itemId: string, taskId: string) =>
    rpcData(
      client.results[':itemId'].trash.$post({
        param: { itemId },
        json: { taskId },
      }),
    )

  return {
    fetchOrganizeStatus,
    fetchOrganizePrepare,
    fetchOrganizeTask,
    createOrganizeTask,
    appendOrganizeTask,
    fetchFailedOrganizeItems,
    skipFailedOrganizeItems,
    pauseOrganizeTask,
    resumeOrganizeTask,
    syncOrganizeStandards,
    retryFailedOrganizeItems,
    classifySuccessfulOrganizeItems,
    clearOrganizeTask,
    fetchOrganizeQueue,
    fetchOrganizeResults,
    fetchOrganizeResultChanges,
    reconcileOrganizeResults,
    fetchOrganizeResult,
    confirmOrganizeResult,
    confirmOrganizeResultsBatch,
    skipOrganizeResult,
    clearOrganizeResultClassification,
    retryOrganizeResult,
    trashOrganizeResult,
  }
}

const organizeApis = {
  image: createOrganizeApi('image'),
  video: createOrganizeApi('video'),
}

export const getOrganizeApi = (mediaType: EagleMediaType) =>
  organizeApis[mediaType]

/** API 实例绑定媒体类型，卸载后继续提交的确认批次仍指向原任务范围。 */
export const useOrganizeApi = () => getOrganizeApi(useOrganizeMedia().mediaType)
