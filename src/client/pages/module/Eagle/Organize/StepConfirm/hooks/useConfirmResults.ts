import { subscribeStorageEvent } from '@/client/service/storage-events'
import type {
  OrganizeFolderStandard,
  OrganizeResultListItem,
} from '@/shared/eagle/organize'
import type { EagleFolder } from '@/shared/eagle/types'
import { message } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildFolderMap } from '../../../folders'
import { RefreshQueue } from '../../../refreshQueue'
import { useOrganizeApi } from '../../api'
import { useOrganizeActions, useOrganizeStatus } from '../../store'
import type { OrganizeSortType, PendingConfirmItem } from '../types'
import {
  getOrganizeItemCategory,
  getOrUpdateCategoryOrder,
  isOrganizeCategoryInScope,
  sortOrganizeResults,
} from '../utils/sort'
import {
  CONFIRM_SORT_STORAGE_KEY,
  createCategoryContext,
  getSavedCategoryOrder,
  getSavedPinnedCategory,
  saveCategoryOrder,
  savePinnedCategory,
} from '../utils/storage'

export interface UseConfirmResultsOptions {
  taskId?: string
  taskCreatedAt?: number
  folders: EagleFolder[]
  standards?: OrganizeFolderStandard[]
  renameOnly?: boolean
}

export function useConfirmResults({
  taskId,
  taskCreatedAt,
  folders,
  standards,
  renameOnly = false,
}: UseConfirmResultsOptions) {
  const { getOptimisticItemIds, refreshOrganizeStatus } = useOrganizeActions()
  const { fetchOrganizeResultChanges, reconcileOrganizeResults } =
    useOrganizeApi()
  const [results, setResults] = useState<OrganizeResultListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [savedSortType, setSortType] = useState<OrganizeSortType>(() => {
    try {
      const saved = localStorage.getItem(CONFIRM_SORT_STORAGE_KEY)
      if (
        saved === 'completion' ||
        saved === 'category' ||
        saved === 'lastModified_desc' ||
        saved === 'lastModified_asc' ||
        saved === 'mtime_desc' ||
        saved === 'mtime_asc'
      )
        return saved
    } catch {
      /* 忽略损坏的本地缓存 */
    }
    return 'category'
  })
  const sortType =
    renameOnly && savedSortType === 'category' ? 'completion' : savedSortType
  const categoryContext = useMemo(
    () => createCategoryContext(folders, standards),
    [folders, standards],
  )
  const [, setCategoryPinRevision] = useState(0)
  const pinnedCategory = getSavedPinnedCategory(taskId, categoryContext)
  const resultsRef = useRef<OrganizeResultListItem[]>([])
  const selectedIdRef = useRef(selectedId)
  selectedIdRef.current = selectedId
  const sequenceRef = useRef(0)
  const mountedRef = useRef(true)
  const { revision } = useOrganizeStatus()

  const replaceResults = useCallback((next: OrganizeResultListItem[]) => {
    resultsRef.current = next
    setResults(next)
  }, [])

  const serverResultsRef = useRef(new Map<string, OrganizeResultListItem>())
  const versionsRef = useRef<{
    resultsVersion?: string
    libraryVersion?: string
  }>({})
  const snapshotTaskRef = useRef<string | undefined>(undefined)

  // 排序和目录变化只重算本地视图；保留原有分类顺序锁与乐观隐藏规则。
  const projectResults = useCallback(
    (hiddenAtStart = new Set<string>()) => {
      const hiddenNow = getOptimisticItemIds()
      const folderMap = buildFolderMap(folders)
      const available = [...serverResultsRef.current.values()]
        .filter(
          (item) =>
            !hiddenAtStart.has(item.itemId) && !hiddenNow.has(item.itemId),
        )
        .map((item) => ({
          ...item,
          folderPaths: item.folderPaths?.map(
            (path, index) =>
              folderMap.get(item.folderIds?.[index] ?? '')?.path ?? path,
          ),
        }))
        .sort((a, b) => b.updatedAt - a.updatedAt)
      const order = getOrUpdateCategoryOrder(
        available,
        folders,
        getSavedCategoryOrder(taskId, taskCreatedAt, categoryContext),
      )
      saveCategoryOrder(taskId, order, categoryContext)
      const sorted = sortOrganizeResults(
        available,
        sortType,
        folders,
        order,
        pinnedCategory,
      )
      replaceResults(sorted)
      setSelectedId((current) =>
        current && sorted.some((item) => item.itemId === current)
          ? current
          : (sorted[0]?.itemId ?? null),
      )
    },
    [
      categoryContext,
      folders,
      pinnedCategory,
      replaceResults,
      sortType,
      taskCreatedAt,
      taskId,
    ],
  )
  const projectRef = useRef(projectResults)
  projectRef.current = projectResults

  const loadResults = useCallback(async () => {
    const sequence = ++sequenceRef.current
    if (snapshotTaskRef.current !== taskId) {
      snapshotTaskRef.current = taskId
      versionsRef.current = {}
      serverResultsRef.current.clear()
      replaceResults([])
      setSelectedId(null)
    }
    if (!taskId) return
    const hiddenAtStart = getOptimisticItemIds()
    const changes = await fetchOrganizeResultChanges(versionsRef.current)
    if (!mountedRef.current || sequence !== sequenceRef.current) return
    // 只对已接受的响应推进游标，过期/乐观操作期间的响应下一次会重放。
    versionsRef.current = {
      resultsVersion: changes.resultsVersion,
      libraryVersion: changes.libraryVersion,
    }
    if (
      !changes.reset &&
      changes.items.length === 0 &&
      changes.removedIds.length === 0
    )
      return
    let changed = changes.reset
    if (changes.reset) serverResultsRef.current.clear()
    for (const id of changes.removedIds) {
      if (serverResultsRef.current.delete(id)) changed = true
    }
    for (const item of changes.items) {
      serverResultsRef.current.set(item.itemId, item)
      changed = true
    }
    if (changed) projectRef.current(hiddenAtStart)
  }, [replaceResults, taskId])
  const loadRef = useRef(loadResults)
  loadRef.current = loadResults
  const refreshQueueRef = useRef<RefreshQueue | null>(null)
  if (!refreshQueueRef.current) {
    refreshQueueRef.current = new RefreshQueue(() => loadRef.current())
  }
  const refreshResults = useCallback(async () => {
    await refreshQueueRef.current!.request()
    return resultsRef.current
  }, [])

  useEffect(() => {
    if (snapshotTaskRef.current === taskId) projectResults()
  }, [projectResults, taskId])

  useEffect(() => {
    mountedRef.current = true
    setLoading(true)
    void refreshResults()
      .catch((error) => {
        console.error('拉取待确认结果失败', error)
        message.error('拉取待确认结果失败')
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false)
      })
    return () => {
      mountedRef.current = false
      sequenceRef.current++
    }
  }, [refreshResults, taskId])

  // 编辑/删除素材也会改变结果投影；库变更与整理状态刷新共用请求队列。
  useEffect(
    () =>
      subscribeStorageEvent('eagle.library', () => {
        void refreshResults().catch((error) =>
          console.error('刷新整理素材信息失败', error),
        )
      }),
    [refreshResults],
  )

  // 进入确认页显式校准缺失结果；排序、SSE 刷新和 GET 查询不触发写入。
  useEffect(() => {
    if (!taskId) return
    void reconcileOrganizeResults(taskId)
      .then(() => refreshOrganizeStatus())
      .catch((error) => {
        console.error('校准缺失整理结果失败', error)
        message.error(
          error instanceof Error ? error.message : '校准整理结果失败',
        )
      })
  }, [taskId])

  // 每次有效校准后刷新；失败后重新开窗时，即使服务端数量不变也能恢复条目。
  useEffect(() => {
    const timer = setTimeout(() => {
      void refreshResults().catch((error) =>
        console.error('刷新待确认结果失败', error),
      )
    }, 200)
    return () => clearTimeout(timer)
  }, [revision, refreshResults])

  const handleSortTypeChange = useCallback((next: OrganizeSortType) => {
    setSortType(next)
    try {
      localStorage.setItem(CONFIRM_SORT_STORAGE_KEY, next)
    } catch {
      /* 忽略存储异常 */
    }
  }, [])

  const handlePinnedCategoryChange = useCallback(
    (category: string | null) => {
      if (!taskId) return
      if (
        category &&
        !resultsRef.current.some((item) =>
          isOrganizeCategoryInScope(getOrganizeItemCategory(item), category),
        )
      )
        return
      // 同步更新排序与选择，取消置顶时回到恢复排序后的首项。
      const sorted = sortOrganizeResults(
        resultsRef.current,
        category ? 'category' : sortType,
        folders,
        getSavedCategoryOrder(taskId, taskCreatedAt, categoryContext),
        category,
      )
      savePinnedCategory(taskId, category, categoryContext)
      setCategoryPinRevision((revision) => revision + 1)
      if (category) handleSortTypeChange('category')
      replaceResults(sorted)
      setSelectedId(sorted[0]?.itemId ?? null)
    },
    [
      folders,
      categoryContext,
      handleSortTypeChange,
      replaceResults,
      sortType,
      taskCreatedAt,
      taskId,
    ],
  )

  useEffect(() => {
    // 已接受当前任务的结果后才检查，避免首次加载或切换任务时误清空置顶。
    if (
      loading ||
      !pinnedCategory ||
      snapshotTaskRef.current !== taskId ||
      !versionsRef.current.resultsVersion
    )
      return
    if (
      !resultsRef.current.some((item) =>
        isOrganizeCategoryInScope(
          getOrganizeItemCategory(item),
          pinnedCategory,
        ),
      )
    ) {
      handlePinnedCategoryChange(null)
    }
  }, [handlePinnedCategoryChange, loading, pinnedCategory, results, taskId])

  /** 乐观移除与选中项切换只有这一份实现，普通/快速/单图操作共用。 */
  const removeItem = useCallback(
    (itemId: string) => {
      const current = resultsRef.current
      const index = current.findIndex((item) => item.itemId === itemId)
      if (index < 0) return null
      sequenceRef.current++
      const originalItem = current[index]
      const remaining = current.filter((item) => item.itemId !== itemId)
      replaceResults(remaining)
      if (selectedIdRef.current === itemId) {
        const next = remaining[index]?.itemId ?? remaining[0]?.itemId ?? null
        selectedIdRef.current = next
        setSelectedId(next)
      }
      return { originalItem }
    },
    [replaceResults],
  )

  const restoreItems = useCallback(
    (items: PendingConfirmItem[]) => {
      if (items.length === 0 || !mountedRef.current) return
      sequenceRef.current++
      const restored = [...resultsRef.current]
      for (const item of items) {
        if (
          item.taskId !== taskId ||
          restored.some((entry) => entry.itemId === item.itemId)
        )
          continue
        restored.push(item.originalItem)
      }
      const order = getOrUpdateCategoryOrder(
        restored,
        folders,
        getSavedCategoryOrder(taskId, taskCreatedAt, categoryContext),
      )
      saveCategoryOrder(taskId, order, categoryContext)
      const sorted = sortOrganizeResults(
        restored,
        sortType,
        folders,
        order,
        pinnedCategory,
      )
      replaceResults(sorted)
      setSelectedId((current) => current ?? sorted[0]?.itemId ?? null)
    },
    [
      categoryContext,
      folders,
      pinnedCategory,
      replaceResults,
      sortType,
      taskCreatedAt,
      taskId,
    ],
  )

  const selectedItem = useMemo(
    () => results.find((item) => item.itemId === selectedId) ?? null,
    [results, selectedId],
  )
  return {
    results,
    selectedId,
    setSelectedId,
    selectedItem,
    loading,
    sortType,
    handleSortTypeChange,
    pinnedCategory,
    handlePinnedCategoryChange,
    refreshResults,
    removeItem,
    restoreItems,
  }
}
