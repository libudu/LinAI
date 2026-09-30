import type { OrganizeResultListItem } from '@/shared/eagle/organize'
import type { EagleFolder } from '@/shared/eagle/types'
import { message } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchOrganizeResults } from '../../api'
import { getOptimisticItemIds, useOrganizeStatus } from '../../store'
import type { OrganizeSortType, PendingConfirmItem } from '../types'
import { getOrUpdateCategoryOrder, sortOrganizeResults } from '../utils/sort'
import {
  CONFIRM_SORT_STORAGE_KEY,
  getSavedCategoryOrder,
  saveCategoryOrder,
} from '../utils/storage'

export interface UseConfirmResultsOptions {
  taskCreatedAt?: number
  folders: EagleFolder[]
}

export function useConfirmResults({
  taskCreatedAt,
  folders,
}: UseConfirmResultsOptions) {
  const [results, setResults] = useState<OrganizeResultListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sortType, setSortType] = useState<OrganizeSortType>(() => {
    try {
      const saved = localStorage.getItem(CONFIRM_SORT_STORAGE_KEY)
      if (
        saved === 'completion' ||
        saved === 'category' ||
        saved === 'mtime_desc' ||
        saved === 'mtime_asc'
      )
        return saved
    } catch {
      /* 忽略损坏的本地缓存 */
    }
    return 'category'
  })
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

  const refreshResults = useCallback(async () => {
    const sequence = ++sequenceRef.current
    const hiddenAtStart = getOptimisticItemIds()
    const succeeded = await fetchOrganizeResults('success')
    if (!mountedRef.current || sequence !== sequenceRef.current)
      return resultsRef.current
    const hiddenNow = getOptimisticItemIds()
    const available = succeeded.filter(
      (item) => !hiddenAtStart.has(item.itemId) && !hiddenNow.has(item.itemId),
    )
    const order = getOrUpdateCategoryOrder(
      available,
      folders,
      getSavedCategoryOrder(taskCreatedAt),
    )
    saveCategoryOrder(taskCreatedAt, order)
    const sorted = sortOrganizeResults(available, sortType, folders, order)
    replaceResults(sorted)
    setSelectedId((current) =>
      current && sorted.some((item) => item.itemId === current)
        ? current
        : (sorted[0]?.itemId ?? null),
    )
    return sorted
  }, [folders, replaceResults, sortType, taskCreatedAt])

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
  }, [refreshResults])

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
          item.taskCreatedAt !== taskCreatedAt ||
          restored.some((entry) => entry.itemId === item.itemId)
        )
          continue
        restored.push(item.originalItem)
      }
      const order = getOrUpdateCategoryOrder(
        restored,
        folders,
        getSavedCategoryOrder(taskCreatedAt),
      )
      saveCategoryOrder(taskCreatedAt, order)
      const sorted = sortOrganizeResults(restored, sortType, folders, order)
      replaceResults(sorted)
      setSelectedId((current) => current ?? sorted[0]?.itemId ?? null)
    },
    [folders, replaceResults, sortType, taskCreatedAt],
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
    refreshResults,
    removeItem,
    restoreItems,
  }
}
