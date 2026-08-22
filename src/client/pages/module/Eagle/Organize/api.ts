import { apiRequest } from '@/client/service/storage'
import type {
  OrganizeItemStatus,
  OrganizePrepareResp,
  OrganizeQueueResp,
  OrganizeResultDetail,
  OrganizeResultListItem,
  OrganizeStatus,
  OrganizeTaskView,
} from '@/shared/eagle/organize'
import type { EagleSortBy, EagleSortOrder } from '@/shared/eagle/types'

// 图片整理接口封装（/api/eagle/organize/*）

export interface OrganizeSortParams {
  folderId?: string
  sortBy: EagleSortBy
  sortOrder: EagleSortOrder
}

export const fetchOrganizeStatus = async (): Promise<OrganizeStatus | null> => {
  const json = await apiRequest<OrganizeStatus | null>(
    '/api/eagle/organize/status',
  )
  return json.data
}

export const fetchOrganizePrepare = async (
  params: OrganizeSortParams,
): Promise<OrganizePrepareResp> => {
  const search = new URLSearchParams({
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
  })
  if (params.folderId) search.set('folderId', params.folderId)
  const json = await apiRequest<OrganizePrepareResp>(
    `/api/eagle/organize/prepare?${search}`,
  )
  return json.data
}

export const fetchOrganizeTask = async (): Promise<OrganizeTaskView | null> => {
  const json = await apiRequest<OrganizeTaskView | null>(
    '/api/eagle/organize/task',
  )
  return json.data
}

export const createOrganizeTask = async (
  params: OrganizeSortParams & {
    count: number
    compress: boolean
    concurrency: number
  },
): Promise<void> => {
  await apiRequest<OrganizeTaskView>('/api/eagle/organize/task', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export const pauseOrganizeTask = async (): Promise<void> => {
  await apiRequest<null>('/api/eagle/organize/task/pause', {
    method: 'POST',
  })
}

export const resumeOrganizeTask = async (): Promise<void> => {
  await apiRequest<null>('/api/eagle/organize/task/resume', {
    method: 'POST',
  })
}

// 强制清空任务：中断 in-flight 请求，丢弃任务与结果，回到第一步
export const clearOrganizeTask = async (): Promise<void> => {
  await apiRequest<null>('/api/eagle/organize/task/clear', {
    method: 'POST',
  })
}

// 执行中步骤的队列预览：执行中/待处理/失败条目（失败附原因）
export const fetchOrganizeQueue = async (
  limit = 20,
): Promise<OrganizeQueueResp> => {
  const json = await apiRequest<OrganizeQueueResp>(
    `/api/eagle/organize/queue?limit=${limit}`,
  )
  return json.data
}

export const fetchOrganizeResults = async (
  status?: OrganizeItemStatus,
  options?: { limit?: number },
): Promise<OrganizeResultListItem[]> => {
  const search = new URLSearchParams()
  if (status) search.set('status', status)
  if (options?.limit !== undefined) search.set('limit', String(options.limit))
  const query = search.toString()
  const json = await apiRequest<OrganizeResultListItem[]>(
    `/api/eagle/organize/results${query ? `?${query}` : ''}`,
  )
  return json.data
}

export const fetchOrganizeResult = async (
  itemId: string,
): Promise<OrganizeResultDetail> => {
  const json = await apiRequest<OrganizeResultDetail>(
    `/api/eagle/organize/results/${itemId}`,
  )
  return json.data
}

// 确认结果：移入目标文件夹，withTitle 决定是否同时修改标题
export const confirmOrganizeResult = async (
  itemId: string,
  withTitle: boolean,
): Promise<void> => {
  await apiRequest<null>(`/api/eagle/organize/results/${itemId}/confirm`, {
    method: 'POST',
    body: JSON.stringify({ withTitle }),
  })
}

// 不处理：不做任何修改
export const skipOrganizeResult = async (itemId: string): Promise<void> => {
  await apiRequest<null>(`/api/eagle/organize/results/${itemId}/skip`, {
    method: 'POST',
  })
}

// 重新执行单图判定
export const retryOrganizeResult = async (itemId: string): Promise<void> => {
  await apiRequest<null>(`/api/eagle/organize/results/${itemId}/retry`, {
    method: 'POST',
  })
}
