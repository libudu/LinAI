import type {
  EagleFolder,
  EagleItem,
  EagleSortBy,
  EagleSortOrder,
} from '@/shared/eagle/types'
import { create } from 'zustand'
import { fetchEagleFolders, fetchEagleItems, refreshEagleIndex } from './api'

export const PAGE_SIZE = 100
const SORT_STORAGE_KEY = 'eagle_sort'
const SIZE_STORAGE_KEY = 'eagle_image_size'
const DISPLAY_STORAGE_KEY = 'eagle_display_options'

export type EagleImageSize = 'small' | 'medium' | 'large'

// 网格展示选项（展示文件名 / 展示文件大小）持久化，默认均不勾选
const loadDisplayOptions = (): Pick<
  EagleState,
  'showFileName' | 'showFileSize'
> => {
  try {
    const raw = localStorage.getItem(DISPLAY_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        showFileName: parsed.showFileName === true,
        showFileSize: parsed.showFileSize === true,
      }
    }
  } catch {
    // 忽略损坏的本地缓存
  }
  return { showFileName: false, showFileSize: false }
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
  listLoading: boolean
  sortBy: EagleSortBy
  sortOrder: EagleSortOrder
  /** 网格图片大小档位 */
  imageSize: EagleImageSize
  /** 在格子底部展示文件名 */
  showFileName: boolean
  /** 在格子底部展示文件大小 */
  showFileSize: boolean

  init: () => Promise<void>
  selectFolder: (folderId: string) => Promise<void>
  setSort: (sortBy: EagleSortBy, sortOrder: EagleSortOrder) => Promise<void>
  setPage: (page: number) => Promise<void>
  setImageSize: (size: EagleImageSize) => void
  setShowFileName: (show: boolean) => void
  setShowFileSize: (show: boolean) => void
  /** 触发后端增量刷新后重拉数据 */
  reload: () => Promise<void>
  /** 仅重拉文件夹树（编辑文件夹后调用） */
  refreshFolders: () => Promise<void>
  /** 重拉文件夹树与当前页（整理确认等写库操作后由 SSE 触发，索引已在服务端更新） */
  refreshCurrentPage: () => Promise<void>
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
      const folders = await fetchEagleFolders()
      set({ folders })
    } finally {
      set({ foldersLoading: false })
    }
  }

  return {
    folders: [],
    foldersLoading: false,
    currentFolderId: '',
    items: [],
    total: 0,
    page: 1,
    allTotal: 0,
    listLoading: false,
    imageSize: loadImageSize(),
    ...loadSort(),
    ...loadDisplayOptions(),

    init: async () => {
      await Promise.all([loadFolders(), loadPage(1)])
    },

    selectFolder: async (folderId) => {
      if (folderId === get().currentFolderId) return
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
        localStorage.setItem(
          DISPLAY_STORAGE_KEY,
          JSON.stringify({
            showFileName: show,
            showFileSize: state.showFileSize,
          }),
        )
        return { showFileName: show }
      })
    },

    setShowFileSize: (show) => {
      set((state) => {
        localStorage.setItem(
          DISPLAY_STORAGE_KEY,
          JSON.stringify({
            showFileName: state.showFileName,
            showFileSize: show,
          }),
        )
        return { showFileSize: show }
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
