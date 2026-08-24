import { apiRequest } from '@/client/service/storage'
import type {
  EagleFolder,
  EagleItemsResp,
  EagleSortBy,
  EagleSortOrder,
} from '@/shared/eagle/types'

// Eagle 图片管理模块接口封装（/api/eagle/*）

export const fetchEagleFolders = async (): Promise<EagleFolder[]> => {
  const json = await apiRequest<EagleFolder[]>('/api/eagle/folders')
  return json.data
}

export interface FetchEagleItemsParams {
  folderId?: string
  sortBy: EagleSortBy
  sortOrder: EagleSortOrder
  offset: number
  limit: number
}

export const fetchEagleItems = async (
  params: FetchEagleItemsParams,
): Promise<EagleItemsResp> => {
  const search = new URLSearchParams({
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
    offset: String(params.offset),
    limit: String(params.limit),
  })
  if (params.folderId) search.set('folderId', params.folderId)
  const json = await apiRequest<EagleItemsResp>(`/api/eagle/items?${search}`)
  return json.data
}

export const refreshEagleIndex = async (): Promise<void> => {
  await apiRequest<null>('/api/eagle/refresh', { method: 'POST' })
}

// 编辑文件夹名称/描述
export const updateEagleFolder = async (
  id: string,
  patch: { name: string; description: string },
): Promise<void> => {
  await apiRequest<null>(`/api/eagle/folders/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
}

// 编辑条目（修改所属文件夹 / 标题）
export const updateEagleItem = async (
  id: string,
  patch: { folderIds?: string[]; name?: string },
): Promise<void> => {
  await apiRequest<null>(`/api/eagle/items/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
}

// 移入 Eagle 回收站（软删除）
export const deleteEagleItem = async (id: string): Promise<void> => {
  await apiRequest<null>(`/api/eagle/items/${id}`, {
    method: 'DELETE',
  })
}

export const eagleThumbnailUrl = (id: string) =>
  `/api/eagle/items/${id}/thumbnail`

export const eagleFileUrl = (id: string) => `/api/eagle/items/${id}/file`
