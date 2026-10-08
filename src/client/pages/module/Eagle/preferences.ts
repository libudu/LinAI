import type { EagleSortBy, EagleSortOrder } from '@/shared/eagle/types'

interface EaglePreferences {
  sortBy: EagleSortBy
  sortOrder: EagleSortOrder
  showFileName: boolean
  showFileSize: boolean
  showFolderTree: boolean
  showEmptyFolders: boolean
  showFolderDescription: boolean
}

const SORT_STORAGE_KEY = 'eagle_sort'
const SIZE_STORAGE_KEY = 'eagle_image_size'
const DISPLAY_STORAGE_KEY = 'eagle_display_options'
const SELECTED_FOLDER_STORAGE_KEY = 'eagle_selected_folder'

export type EagleImageSize = 'small' | 'medium' | 'large'

// 纯前端展示选项持久化，默认显示文件夹树和空文件夹，其余均不勾选
export const loadViewOptions = (): Pick<
  EaglePreferences,
  | 'showFileName'
  | 'showFileSize'
  | 'showFolderTree'
  | 'showEmptyFolders'
  | 'showFolderDescription'
> => {
  try {
    const raw = localStorage.getItem(DISPLAY_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        showFileName: parsed.showFileName === true,
        showFileSize: parsed.showFileSize === true,
        showFolderTree: parsed.showFolderTree !== false,
        showEmptyFolders: parsed.showEmptyFolders !== false,
        showFolderDescription: parsed.showFolderDescription === true,
      }
    }
  } catch {
    // 忽略损坏的本地缓存
  }
  return {
    showFileName: false,
    showFileSize: false,
    showFolderTree: true,
    showEmptyFolders: true,
    showFolderDescription: false,
  }
}

// 排序偏好持久化（仅前端状态，不走服务端设置）
export const loadSort = (): Pick<EaglePreferences, 'sortBy' | 'sortOrder'> => {
  try {
    const raw = localStorage.getItem(SORT_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (
        (parsed.sortBy === 'lastModified' ||
          parsed.sortBy === 'mtime' ||
          parsed.sortBy === 'size') &&
        (parsed.sortOrder === 'asc' || parsed.sortOrder === 'desc')
      ) {
        return parsed
      }
    }
  } catch {
    // 忽略损坏的本地缓存
  }
  return { sortBy: 'mtime', sortOrder: 'desc' }
}

// 图片大小档位持久化（默认中档）
export const loadImageSize = (): EagleImageSize => {
  const raw = localStorage.getItem(SIZE_STORAGE_KEY)
  if (raw === 'small' || raw === 'medium' || raw === 'large') return raw
  return 'medium'
}

export const loadSelectedFolderId = () =>
  localStorage.getItem(SELECTED_FOLDER_STORAGE_KEY) ?? ''

export const persistSelectedFolderId = (folderId: string) => {
  if (folderId) localStorage.setItem(SELECTED_FOLDER_STORAGE_KEY, folderId)
  else localStorage.removeItem(SELECTED_FOLDER_STORAGE_KEY)
}

// 视觉选项整体落盘，供各 setter 复用
export const persistViewOptions = (state: {
  showFileName: boolean
  showFileSize: boolean
  showFolderTree: boolean
  showEmptyFolders: boolean
  showFolderDescription: boolean
}) => {
  localStorage.setItem(
    DISPLAY_STORAGE_KEY,
    JSON.stringify({
      showFileName: state.showFileName,
      showFileSize: state.showFileSize,
      showFolderTree: state.showFolderTree,
      showEmptyFolders: state.showEmptyFolders,
      showFolderDescription: state.showFolderDescription,
    }),
  )
}

export const persistSort = (sortBy: EagleSortBy, sortOrder: EagleSortOrder) => {
  localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify({ sortBy, sortOrder }))
}

export const persistImageSize = (size: EagleImageSize) => {
  localStorage.setItem(SIZE_STORAGE_KEY, size)
}
