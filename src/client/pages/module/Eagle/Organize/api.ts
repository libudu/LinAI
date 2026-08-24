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

// 向当前锁定任务追加未入队的图片到队尾
export const appendOrganizeTask = async (params: {
  count: number
}): Promise<void> => {
  await apiRequest<null>('/api/eagle/organize/task/append', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

// 获取失败条目列表
export const fetchFailedOrganizeItems = async (): Promise<
  import('@/shared/eagle/organize').OrganizeFailedItem[]
> => {
  const json = await apiRequest<
    import('@/shared/eagle/organize').OrganizeFailedItem[]
  >('/api/eagle/organize/failed-items')
  return json.data
}

// 批量跳过所有失败项
export const skipFailedOrganizeItems = async (): Promise<void> => {
  await apiRequest<null>('/api/eagle/organize/task/skip-failed', {
    method: 'POST',
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

// 将全部失败项移到队首并恢复执行
export const retryFailedOrganizeItems = async (): Promise<void> => {
  await apiRequest<null>('/api/eagle/organize/task/retry-failed', {
    method: 'POST',
  })
}

// 过滤未处理与失败项，仅用成功结果进入分类确认
export const classifySuccessfulOrganizeItems = async (): Promise<void> => {
  await apiRequest<null>('/api/eagle/organize/task/classify-successful', {
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
  folderPath: string,
  withTitle: boolean,
  folderId?: string,
): Promise<void> => {
  await apiRequest<null>(`/api/eagle/organize/results/${itemId}/confirm`, {
    method: 'POST',
    body: JSON.stringify({ folderPath, withTitle, folderId }),
  })
}

// 不处理：不做任何修改
export const skipOrganizeResult = async (itemId: string): Promise<void> => {
  await apiRequest<null>(`/api/eagle/organize/results/${itemId}/skip`, {
    method: 'POST',
  })
}

// 清空条目的全部文件夹归属，留到「未分类」中手动处理
export const clearOrganizeResultClassification = async (
  itemId: string,
): Promise<void> => {
  await apiRequest<null>(
    `/api/eagle/organize/results/${itemId}/clear-classification`,
    { method: 'POST' },
  )
}

// 重新执行单图判定
export const retryOrganizeResult = async (itemId: string): Promise<void> => {
  await apiRequest<null>(`/api/eagle/organize/results/${itemId}/retry`, {
    method: 'POST',
  })
}
