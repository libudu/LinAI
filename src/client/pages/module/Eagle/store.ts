import type {
  EagleFolder,
  EagleItem,
  EagleSortBy,
  EagleSortOrder,
} from '@/shared/eagle/types'
import { EAGLE_UNCLASSIFIED_FOLDER_ID } from '@/shared/eagle/types'
import { create } from 'zustand'
import { fetchEagleFolders, fetchEagleItems, refreshEagleIndex } from './api'

export const PAGE_SIZE = 100
const SORT_STORAGE_KEY = 'eagle_sort'
const SIZE_STORAGE_KEY = 'eagle_image_size'
const DISPLAY_STORAGE_KEY = 'eagle_display_options'
const SELECTED_FOLDER_STORAGE_KEY = 'eagle_selected_folder'

let libraryRefreshSuspended = false
let libraryRefreshPending = false

export type EagleImageSize = 'small' | 'medium' | 'large'

// 纯前端视觉选项（展示文件名 / 展示文件大小 / 展示文件夹描述）持久化，默认均不勾选
const loadViewOptions = (): Pick<
  EagleState,
  'showFileName' | 'showFileSize' | 'showFolderDescription'
> => {
  try {
    const raw = localStorage.getItem(DISPLAY_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        showFileName: parsed.showFileName === true,
        showFileSize: parsed.showFileSize === true,
        showFolderDescription: parsed.showFolderDescription === true,
      }
    }
  } catch {
    // 忽略损坏的本地缓存
  }
  return {
    showFileName: false,
    showFileSize: false,
    showFolderDescription: false,
  }
}

// 排序偏好持久化（仅前端状态，不走服务端设置）
const loadSort = (): Pick<EagleState, 'sortBy' | 'sortOrder'> => {
  try {
    const raw = localStorage.getItem(SORT_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (
        (parsed.sortBy === 'mtime' || parsed.sortBy === 'size') &&
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
const loadImageSize = (): EagleImageSize => {
  const raw = localStorage.getItem(SIZE_STORAGE_KEY)
  if (raw === 'small' || raw === 'medium' || raw === 'large') return raw
  return 'medium'
}

const loadSelectedFolderId = () =>
  localStorage.getItem(SELECTED_FOLDER_STORAGE_KEY) ?? ''

const hasFolder = (folders: EagleFolder[], folderId: string): boolean =>
  folderId === EAGLE_UNCLASSIFIED_FOLDER_ID ||
  folders.some(
    (folder) =>
      folder.id === folderId || hasFolder(folder.children, folderId),
  )

const persistSelectedFolderId = (folderId: string) => {
  if (folderId) localStorage.setItem(SELECTED_FOLDER_STORAGE_KEY, folderId)
  else localStorage.removeItem(SELECTED_FOLDER_STORAGE_KEY)
}

// Eagle 图片管理页面状态：文件夹树 + 当前文件夹的资源列表（分批加载）
interface EagleState {
  folders: EagleFolder[]
  foldersLoading: boolean
  /** 当前选中文件夹，空字符串表示「全部」 */
  currentFolderId: string
  items: EagleItem[]
  total: number
  /** 当前页码（从 1 开始） */
  page: number
  /** 「全部」分类的总数（用于目录树虚拟节点展示） */
  allTotal: number
  /** 「未分类」虚拟文件夹的资源数 */
  unclassifiedTotal: number
  listLoading: boolean
  sortBy: EagleSortBy
  sortOrder: EagleSortOrder
  /** 网格图片大小档位 */
  imageSize: EagleImageSize
  /** 在格子底部展示文件名 */
  showFileName: boolean
  /** 在格子底部展示文件大小 */
  showFileSize: boolean
  /** 在文件夹树节点名称下方展示描述 */
  showFolderDescription: boolean

  init: () => Promise<void>
  selectFolder: (folderId: string) => Promise<void>
  setSort: (sortBy: EagleSortBy, sortOrder: EagleSortOrder) => Promise<void>
  setPage: (page: number) => Promise<void>
  setImageSize: (size: EagleImageSize) => void
  setShowFileName: (show: boolean) => void
  setShowFileSize: (show: boolean) => void
  setShowFolderDescription: (show: boolean) => void
  /** 触发后端增量刷新后重拉数据 */
  reload: () => Promise<void>
  /** 仅重拉文件夹树（编辑文件夹后调用） */
  refreshFolders: () => Promise<void>
  /** 重拉文件夹树与当前页（整理确认等写库操作后由 SSE 触发，索引已在服务端更新） */
  refreshCurrentPage: () => Promise<void>
}

// 视觉选项整体落盘，供各 setter 复用
const persistViewOptions = (state: {
  showFileName: boolean
  showFileSize: boolean
  showFolderDescription: boolean
}) => {
  localStorage.setItem(
    DISPLAY_STORAGE_KEY,
    JSON.stringify({
      showFileName: state.showFileName,
      showFileSize: state.showFileSize,
      showFolderDescription: state.showFolderDescription,
    }),
  )
}

export const useEagleStore = create<EagleState>()((set, get) => {
  const loadPage = async (page: number) => {
    const { currentFolderId, sortBy, sortOrder } = get()
    set({ listLoading: true })
    try {
      const resp = await fetchEagleItems({
        folderId: currentFolderId || undefined,
        sortBy,
        sortOrder,
        offset: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
      })
      set({ items: resp.items, total: resp.total, page })
      if (!currentFolderId) set({ allTotal: resp.total })
    } finally {
      set({ listLoading: false })
    }
  }

  const loadFolders = async () => {
    set({ foldersLoading: true })
    try {
      const { sortBy, sortOrder } = get()
      const [folders, all, unclassified] = await Promise.all([
        fetchEagleFolders(),
        fetchEagleItems({
          sortBy,
          sortOrder,
          offset: 0,
          limit: 1,
        }),
        fetchEagleItems({
          folderId: EAGLE_UNCLASSIFIED_FOLDER_ID,
          sortBy,
          sortOrder,
          offset: 0,
          limit: 1,
        }),
      ])
      set({
        folders,
        allTotal: all.total,
        unclassifiedTotal: unclassified.total,
      })
      return folders
    } finally {
      set({ foldersLoading: false })
    }
  }

  return {
    folders: [],
    foldersLoading: false,
    currentFolderId: loadSelectedFolderId(),
    items: [],
    total: 0,
    page: 1,
    allTotal: 0,
    unclassifiedTotal: 0,
    listLoading: false,
    imageSize: loadImageSize(),
    ...loadSort(),
    ...loadViewOptions(),

    init: async () => {
      const folders = await loadFolders()
      const currentFolderId = get().currentFolderId
      if (currentFolderId && !hasFolder(folders, currentFolderId)) {
        persistSelectedFolderId('')
        set({ currentFolderId: '' })
      }
      await loadPage(1)
    },

    selectFolder: async (folderId) => {
      if (folderId === get().currentFolderId) return
      persistSelectedFolderId(folderId)
      set({ currentFolderId: folderId, items: [], total: 0, page: 1 })
      await loadPage(1)
    },

    setSort: async (sortBy, sortOrder) => {
      localStorage.setItem(
        SORT_STORAGE_KEY,
        JSON.stringify({ sortBy, sortOrder }),
      )
      set({ sortBy, sortOrder, items: [], total: 0, page: 1 })
      await loadPage(1)
    },

    setPage: async (page) => {
      const { page: currentPage, listLoading } = get()
      if (listLoading || page === currentPage || page < 1) return
      await loadPage(page)
    },

    setImageSize: (size) => {
      localStorage.setItem(SIZE_STORAGE_KEY, size)
      set({ imageSize: size })
    },

    setShowFileName: (show) => {
      set((state) => {
        persistViewOptions({ ...state, showFileName: show })
        return { showFileName: show }
      })
    },

    setShowFileSize: (show) => {
      set((state) => {
        persistViewOptions({ ...state, showFileSize: show })
        return { showFileSize: show }
      })
    },

    setShowFolderDescription: (show) => {
      set((state) => {
        persistViewOptions({ ...state, showFolderDescription: show })
        return { showFolderDescription: show }
      })
    },

    reload: async () => {
      await refreshEagleIndex()
      set({ items: [], total: 0, page: 1 })
      await Promise.all([loadFolders(), loadPage(1)])
    },

    refreshFolders: async () => {
      await loadFolders()
    },

    refreshCurrentPage: async () => {
      await Promise.all([loadFolders(), loadPage(get().page)])
      // 条目被移出当前文件夹后当前页可能被清空，回到第一页
      if (get().items.length === 0 && get().page > 1) await loadPage(1)
    },
  }
})

/**
 * 响应 eagle.library 变更：整理弹窗打开时只记脏，避免刷新被遮挡的列表；
 * 弹窗关闭后由 setEagleLibraryRefreshSuspended 合并执行一次。
 */
export const requestEagleLibraryRefresh = async (): Promise<void> => {
  if (libraryRefreshSuspended) {
    libraryRefreshPending = true
    return
  }
  await useEagleStore.getState().refreshCurrentPage()
}

export const setEagleLibraryRefreshSuspended = async (
  suspended: boolean,
): Promise<void> => {
  libraryRefreshSuspended = suspended
  if (suspended || !libraryRefreshPending) return
  libraryRefreshPending = false
  await useEagleStore.getState().refreshCurrentPage()
}
