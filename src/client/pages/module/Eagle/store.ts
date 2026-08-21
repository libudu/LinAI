import type {
  EagleFolder,
  EagleItem,
  EagleSortBy,
  EagleSortOrder,
} from '@/shared/eagle/types'
import { create } from 'zustand'
import {
  fetchEagleFolders,
  fetchEagleItems,
  refreshEagleIndex,
} from './api'

const PAGE_SIZE = 100
const SORT_STORAGE_KEY = 'eagle_sort'

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

// Eagle 图片管理页面状态：文件夹树 + 当前文件夹的资源列表（分批加载）
interface EagleState {
  folders: EagleFolder[]
  foldersLoading: boolean
  /** 当前选中文件夹，空字符串表示「全部」 */
  currentFolderId: string
  items: EagleItem[]
  total: number
  /** 「全部」分类的总数（用于目录树虚拟节点展示） */
  allTotal: number
  listLoading: boolean
  loadingMore: boolean
  sortBy: EagleSortBy
  sortOrder: EagleSortOrder

  init: () => Promise<void>
  selectFolder: (folderId: string) => Promise<void>
  setSort: (sortBy: EagleSortBy, sortOrder: EagleSortOrder) => Promise<void>
  loadMore: () => Promise<void>
  /** 触发后端增量刷新后重拉数据 */
  reload: () => Promise<void>
}

export const useEagleStore = create<EagleState>()((set, get) => {
  const loadFirstPage = async () => {
    const { currentFolderId, sortBy, sortOrder } = get()
    set({ listLoading: true })
    try {
      const resp = await fetchEagleItems({
        folderId: currentFolderId || undefined,
        sortBy,
        sortOrder,
        offset: 0,
        limit: PAGE_SIZE,
      })
      set({ items: resp.items, total: resp.total })
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
    allTotal: 0,
    listLoading: false,
    loadingMore: false,
    ...loadSort(),

    init: async () => {
      await Promise.all([loadFolders(), loadFirstPage()])
    },

    selectFolder: async (folderId) => {
      if (folderId === get().currentFolderId) return
      set({ currentFolderId: folderId, items: [], total: 0 })
      await loadFirstPage()
    },

    setSort: async (sortBy, sortOrder) => {
      localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify({ sortBy, sortOrder }))
      set({ sortBy, sortOrder, items: [], total: 0 })
      await loadFirstPage()
    },

    loadMore: async () => {
      const { items, total, loadingMore, listLoading } = get()
      if (loadingMore || listLoading || items.length >= total) return
      set({ loadingMore: true })
      try {
        const { currentFolderId, sortBy, sortOrder } = get()
        const resp = await fetchEagleItems({
          folderId: currentFolderId || undefined,
          sortBy,
          sortOrder,
          offset: items.length,
          limit: PAGE_SIZE,
        })
        set({ items: [...get().items, ...resp.items], total: resp.total })
      } finally {
        set({ loadingMore: false })
      }
    },

    reload: async () => {
      await refreshEagleIndex()
      set({ items: [], total: 0 })
      await Promise.all([loadFolders(), loadFirstPage()])
    },
  }
})
