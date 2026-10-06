import {
  EAGLE_TRASH_FOLDER_ID,
  EAGLE_UNCLASSIFIED_FOLDER_ID,
  type EagleFolder,
  type EagleItem,
  type EagleSortBy,
  type EagleSortOrder,
} from '@/shared/eagle/types'
import { create } from 'zustand'
import { fetchEagleItems, fetchEagleOverview, refreshEagleIndex } from './api'
import { findFolder } from './folders'
import { LibraryRefreshController } from './libraryRefresh'
import {
  loadImageSize,
  loadSelectedFolderId,
  loadSort,
  loadViewOptions,
  persistImageSize,
  persistSelectedFolderId,
  persistSort,
  persistViewOptions,
  type EagleImageSize,
} from './preferences'
export type { EagleImageSize } from './preferences'

export const PAGE_SIZE = 100
const hasFolder = (folders: EagleFolder[], folderId: string): boolean =>
  folderId === EAGLE_UNCLASSIFIED_FOLDER_ID ||
  folderId === EAGLE_TRASH_FOLDER_ID ||
  findFolder(folders, folderId) !== null

// Eagle 图片管理页面状态：文件夹树 + 当前文件夹的资源列表（分批加载）
interface EagleState {
  folders: EagleFolder[]
  foldersLoading: boolean
  /** 当前选中文件夹，空字符串表示「全部」 */
  currentFolderId: string
  /** 当前列表的文件名搜索词，不持久化 */
  keyword: string
  items: EagleItem[]
  total: number
  /** 当前页码（从 1 开始） */
  page: number
  /** 「全部」分类的总数（用于目录树虚拟节点展示） */
  allTotal: number
  /** 「未分类」虚拟文件夹的资源数 */
  unclassifiedTotal: number
  /** 「回收站」虚拟文件夹的资源数 */
  trashTotal: number
  listLoading: boolean
  sortBy: EagleSortBy
  sortOrder: EagleSortOrder
  /** 网格图片大小档位 */
  imageSize: EagleImageSize
  /** 在格子底部展示文件名 */
  showFileName: boolean
  /** 在格子底部展示文件大小 */
  showFileSize: boolean
  /** 展示桌面端左侧文件夹树 */
  showFolderTree: boolean
  /** 在文件夹树节点名称下方展示描述 */
  showFolderDescription: boolean

  init: () => Promise<void>
  selectFolder: (folderId: string) => Promise<void>
  setKeyword: (keyword: string) => Promise<void>
  setSort: (sortBy: EagleSortBy, sortOrder: EagleSortOrder) => Promise<void>
  setPage: (page: number) => Promise<void>
  setImageSize: (size: EagleImageSize) => void
  setShowFileName: (show: boolean) => void
  setShowFileSize: (show: boolean) => void
  setShowFolderTree: (show: boolean) => void
  setShowFolderDescription: (show: boolean) => void
  /** 触发后端增量刷新后重拉数据 */
  reload: () => Promise<void>
  /** 仅重拉文件夹树（编辑文件夹后调用） */
  refreshFolders: () => Promise<void>
  /** 重拉文件夹树与当前页（整理确认等写库操作后由 SSE 触发，索引已在服务端更新） */
  refreshCurrentPage: () => Promise<void>
}

export const useEagleStore = create<EagleState>()((set, get) => {
  let pageSequence = 0
  let foldersSequence = 0
  let requestedPage = 1
  const loadPage = async (page: number, options?: { silent?: boolean }) => {
    const sequence = ++pageSequence
    requestedPage = page
    const { currentFolderId, keyword, sortBy, sortOrder } = get()
    if (!options?.silent) {
      set({ listLoading: true })
    }
    try {
      const resp = await fetchEagleItems({
        folderId: currentFolderId || undefined,
        keyword: keyword || undefined,
        sortBy,
        sortOrder,
        offset: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
      })
      if (sequence !== pageSequence) return false
      set({ items: resp.items, total: resp.total, page })
      // 搜索结果总数用于工具栏与分页，不覆盖文件夹树的完整计数。
      if (!keyword) {
        if (!currentFolderId) set({ allTotal: resp.total })
        else if (currentFolderId === EAGLE_UNCLASSIFIED_FOLDER_ID)
          set({ unclassifiedTotal: resp.total })
        else if (currentFolderId === EAGLE_TRASH_FOLDER_ID)
          set({ trashTotal: resp.total })
      }
      return true
    } finally {
      if (sequence === pageSequence) {
        set({ listLoading: false })
      }
    }
  }

  const loadFolders = async () => {
    const sequence = ++foldersSequence
    set({ foldersLoading: true })
    try {
      const overview = await fetchEagleOverview()
      if (sequence !== foldersSequence) return get().folders
      set(overview)
      return overview.folders
    } finally {
      if (sequence === foldersSequence) set({ foldersLoading: false })
    }
  }

  return {
    folders: [],
    foldersLoading: false,
    currentFolderId: loadSelectedFolderId(),
    keyword: '',
    items: [],
    total: 0,
    page: 1,
    allTotal: 0,
    unclassifiedTotal: 0,
    trashTotal: 0,
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

    setKeyword: async (value) => {
      const keyword = value.trim()
      set({ keyword, items: [], total: 0, page: 1 })
      await loadPage(1)
    },

    setSort: async (sortBy, sortOrder) => {
      persistSort(sortBy, sortOrder)
      set({ sortBy, sortOrder, items: [], total: 0, page: 1 })
      await loadPage(1)
    },

    setPage: async (page) => {
      const { page: currentPage, listLoading } = get()
      if (listLoading || page === currentPage || page < 1) return
      await loadPage(page)
    },

    setImageSize: (size) => {
      persistImageSize(size)
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

    setShowFolderTree: (show) => {
      set((state) => {
        persistViewOptions({ ...state, showFolderTree: show })
        return { showFolderTree: show }
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
      const [, pageApplied] = await Promise.all([
        loadFolders(),
        loadPage(requestedPage, { silent: true }),
      ])
      // 条目被移出当前文件夹后当前页可能被清空，回到第一页
      if (pageApplied && get().items.length === 0 && get().page > 1) {
        await loadPage(1)
      }
    },
  }
})

const libraryRefresh = new LibraryRefreshController(() =>
  useEagleStore.getState().refreshCurrentPage(),
)
export const requestEagleLibraryRefresh = libraryRefresh.request
export const setEagleLibraryRefreshSuspended = libraryRefresh.setSuspended
