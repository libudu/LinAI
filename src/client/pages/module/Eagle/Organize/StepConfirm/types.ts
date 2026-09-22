import type { OrganizeResultListItem } from '@/shared/eagle/organize'

export type OrganizeSortType =
  | 'completion'
  | 'category'
  | 'mtime_desc'
  | 'mtime_asc'

export const SPECIAL_CATEGORY_LOW_QUALITY = '疑似低质'
export const SPECIAL_CATEGORY_UNCLASSIFIED = '未分类'

export interface PinnedFolderOption {
  key: string
  type: 'ai' | 'manual'
  folderPath: string
  folderId?: string
  count?: number
}

export interface PendingConfirmItem {
  itemId: string
  folderPath: string
  withTitle: boolean
  folderId?: string
  originalItem: OrganizeResultListItem
  index: number
}
