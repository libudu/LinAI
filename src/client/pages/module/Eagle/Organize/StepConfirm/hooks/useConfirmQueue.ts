import type { OrganizeResultListItem } from '@/shared/eagle/organize'
import type { EagleFolder } from '@/shared/eagle/types'
import { message } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  confirmOrganizeResultsBatch,
  fetchOrganizeResults,
} from '../../api'
import { decrementPendingConfirm, setOrganizeStatusSuspended } from '../../store'
import type { OrganizeSortType, PendingConfirmItem } from '../types'
import { getOrUpdateCategoryOrder, sortOrganizeResults } from '../utils/sort'
import {
  CONFIRM_SORT_STORAGE_KEY,
  getSavedCategoryOrder,
  saveCategoryOrder,
} from '../utils/storage'

interface UseConfirmQueueOptions {
  taskCreatedAt?: number
  folders: EagleFolder[]
}

export function useConfirmQueue({
  taskCreatedAt,
  folders,
}: UseConfirmQueueOptions) {
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
      ) {
        return saved
      }
    } catch {
      // 忽略损坏的本地缓存
    }
    return 'category'
  })

  const resultsRef = useRef<OrganizeResultListItem[]>([])
  const inFlightActionIdsRef = useRef(new Set<string>())
  const pendingBatchRef = useRef<PendingConfirmItem[]>([])
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFlushingRef = useRef(false)

  // 挂载时挂起 OrganizeStatus 轮询，避免确认期间高频触发 /status 请求；卸载时恢复并校准
  useEffect(() => {
    setOrganizeStatusSuspended(true)
    return () => {
      setOrganizeStatusSuspended(false)
    }
  }, [])

  // 仅拉取判定成功的结果，结合当前任务固化的分类顺序组织队列
  const refreshResults = useCallback(async (): Promise<
    OrganizeResultListItem[]
  > => {
    const succeeded = await fetchOrganizeResults('success')
    // 1. 读取当前任务已固化的分类先后排位
    const existingOrder = getSavedCategoryOrder(taskCreatedAt)
    // 2. 补全新追加的分类并持久化（确保已有分类排位绝对稳定，避免数量减少后排位跳动）
    const updatedOrder = getOrUpdateCategoryOrder(
      succeeded,
      folders,
      existingOrder,
    )
    saveCategoryOrder(taskCreatedAt, updatedOrder)
    // 3. 执行多维排序（疑似低质绝对置顶 -> 未分类次高置顶 -> 常规分类按固化顺序 -> updatedAt 正序）
    const sorted = sortOrganizeResults(
      succeeded,
      sortType,
      folders,
      updatedOrder,
    )
    resultsRef.current = sorted
    setResults(sorted)
    return sorted
  }, [folders, sortType, taskCreatedAt])

  // 排序切换并同步重排列表
  const handleSortTypeChange = useCallback(
    (newSort: OrganizeSortType) => {
      setSortType(newSort)
      try {
        localStorage.setItem(CONFIRM_SORT_STORAGE_KEY, newSort)
      } catch {
        // 忽略损坏的本地缓存
      }
      const existingOrder = getSavedCategoryOrder(taskCreatedAt)
      const nextSorted = sortOrganizeResults(
        resultsRef.current,
        newSort,
        folders,
        existingOrder,
      )
      resultsRef.current = nextSorted
      setResults(nextSorted)
      setSelectedId(nextSorted[0]?.itemId ?? null)
    },
    [folders, taskCreatedAt],
  )

  // 初始加载拉取一次
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    refreshResults()
      .then((sorted) => {
        if (cancelled) return
        setSelectedId((prev) =>
          prev && sorted.some((r) => r.itemId === prev)
            ? prev
            : (sorted[0]?.itemId ?? null),
        )
      })
      .catch((error) => {
        console.error('拉取待确认结果失败', error)
        message.error('拉取待确认结果失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refreshResults])

  // 批量提交待确认批次
  const flushPendingBatch = useCallback(async () => {
    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current)
      batchTimerRef.current = null
    }
    if (pendingBatchRef.current.length === 0) return
    if (isFlushingRef.current) return

    isFlushingRef.current = true
    const batchToProcess = [...pendingBatchRef.current]
    pendingBatchRef.current = []

    try {
      await confirmOrganizeResultsBatch(
        batchToProcess.map((b) => ({
          itemId: b.itemId,
          folderPath: b.folderPath,
          withTitle: b.withTitle,
          folderId: b.folderId,
        })),
      )
    } catch (error) {
      console.error('批量确认失败', error)
      message.error(error instanceof Error ? error.message : '确认失败')
      // 发生错误时回退未成功的条目到待确认列表并补偿待确认计数
      decrementPendingConfirm(-batchToProcess.length)
      const current = resultsRef.current
      const restored = [...current]
      for (const b of batchToProcess) {
        if (!restored.some((r) => r.itemId === b.itemId)) {
          restored.splice(Math.min(b.index, restored.length), 0, b.originalItem)
        }
      }
      resultsRef.current = restored
      setResults(restored)
      setSelectedId((curr) => curr ?? batchToProcess[0]?.itemId ?? null)
    } finally {
      isFlushingRef.current = false
      if (pendingBatchRef.current.length >= 20) {
        void flushPendingBatch()
      } else if (pendingBatchRef.current.length > 0 && !batchTimerRef.current) {
        batchTimerRef.current = setTimeout(() => {
          void flushPendingBatch()
        }, 3000)
      }
    }
  }, [])

  // 组件卸载时自动提交剩余的待确认队列
  useEffect(() => {
    return () => {
      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current)
        batchTimerRef.current = null
      }
      if (pendingBatchRef.current.length > 0) {
        const batch = [...pendingBatchRef.current]
        pendingBatchRef.current = []
        void confirmOrganizeResultsBatch(
          batch.map((b) => ({
            itemId: b.itemId,
            folderPath: b.folderPath,
            withTitle: b.withTitle,
            folderId: b.folderId,
          })),
        ).catch((err) => {
          console.error('组件卸载时批量确认失败', err)
        })
      }
    }
  }, [])

  // 通用单图操作（跳过/重试/清除分类/移到回收站），执行前先冲刷批次，支持失败回滚
  const runAction = useCallback(
    async (fn: (itemId: string) => Promise<void>, targetId?: string) => {
      const itemId = targetId ?? selectedId
      if (!itemId || inFlightActionIdsRef.current.has(itemId)) return

      const current = resultsRef.current
      const item = current.find((r) => r.itemId === itemId)
      if (!item) return

      const index = current.findIndex((result) => result.itemId === itemId)
      const remaining = current.filter((result) => result.itemId !== itemId)
      const nextId =
        itemId === selectedId
          ? (remaining[index]?.itemId ?? remaining[0]?.itemId ?? null)
          : selectedId

      // 立即乐观更新列表与选中项，界面无卡顿响应，并同步乐观扣减外层徽标
      resultsRef.current = remaining
      setResults(remaining)
      setSelectedId(nextId)
      decrementPendingConfirm(1)

      inFlightActionIdsRef.current.add(itemId)
      try {
        // 先冲刷待确认队列中积攒的项目，确保时序一致且避免并发写库冲突
        await flushPendingBatch()
        await fn(itemId)
      } catch (error) {
        message.error(error instanceof Error ? error.message : '操作失败')
        // 发生错误时回退该条目并回补待确认计数
        decrementPendingConfirm(-1)
        const latest = resultsRef.current
        if (!latest.some((r) => r.itemId === itemId)) {
          const restored = [...latest]
          restored.splice(Math.min(index, restored.length), 0, item)
          resultsRef.current = restored
          setResults(restored)
          setSelectedId((curr) => curr ?? itemId)
        }
      } finally {
        inFlightActionIdsRef.current.delete(itemId)
      }
    },
    [flushPendingBatch, selectedId],
  )

  // 快速模式下单项确认（直接按第一推荐分类确认）
  const confirmItemQuick = useCallback(
    (item: OrganizeResultListItem, withTitle: boolean) => {
      const itemId = item.itemId
      const current = resultsRef.current
      const foundIndex = current.findIndex((r) => r.itemId === itemId)
      if (foundIndex === -1) return

      const remaining = current.filter((r) => r.itemId !== itemId)
      const nextId =
        remaining[foundIndex]?.itemId ?? remaining[0]?.itemId ?? null

      const targetFolderPath = item.folderPaths?.[0] || '未分类'

      resultsRef.current = remaining
      setResults(remaining)
      setSelectedId(nextId)
      decrementPendingConfirm(1)

      pendingBatchRef.current.push({
        itemId,
        folderPath: targetFolderPath,
        withTitle,
        originalItem: item,
        index: foundIndex,
      })

      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current)
        batchTimerRef.current = null
      }

      if (pendingBatchRef.current.length >= 20) {
        void flushPendingBatch()
      } else {
        batchTimerRef.current = setTimeout(() => {
          void flushPendingBatch()
        }, 3000)
      }
    },
    [flushPendingBatch],
  )

  // 普通模式下当前项确认
  const confirmCurrentItem = useCallback(
    (options: {
      folderPath: string
      withTitle: boolean
      folderId?: string
    }) => {
      if (!selectedId) return

      const itemId = selectedId
      const current = resultsRef.current
      const item = current.find((result) => result.itemId === itemId)
      if (!item) return

      const index = current.findIndex((result) => result.itemId === itemId)
      const remaining = current.filter((result) => result.itemId !== itemId)
      const nextId = remaining[index]?.itemId ?? remaining[0]?.itemId ?? null

      // 立即乐观切换下一张，界面无卡顿响应，并同步乐观扣减外层徽标
      resultsRef.current = remaining
      setResults(remaining)
      setSelectedId(nextId)
      decrementPendingConfirm(1)

      // 加入待确认批次队列
      pendingBatchRef.current.push({
        itemId,
        folderPath: options.folderPath,
        withTitle: options.withTitle,
        folderId: options.folderId,
        originalItem: item,
        index,
      })

      // 清除已有防抖定时器
      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current)
        batchTimerRef.current = null
      }

      // 累积满 20 个立即发送，否则 3 秒防抖后发送
      if (pendingBatchRef.current.length >= 20) {
        void flushPendingBatch()
      } else {
        batchTimerRef.current = setTimeout(() => {
          void flushPendingBatch()
        }, 3000)
      }
    },
    [flushPendingBatch, selectedId],
  )

  const selectedItem = useMemo(
    () => (selectedId ? results.find((r) => r.itemId === selectedId) : null),
    [results, selectedId],
  )

  return {
    results,
    resultsRef,
    selectedId,
    setSelectedId,
    selectedItem,
    loading,
    sortType,
    handleSortTypeChange,
    refreshResults,
    flushPendingBatch,
    confirmItemQuick,
    confirmCurrentItem,
    runAction,
  }
}
