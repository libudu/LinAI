import type {
  OrganizeResultDetail,
  OrganizeResultListItem,
} from '@/shared/eagle/organize'
import { Button, Empty, Image, Spin, message } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { deleteEagleItem, eagleFileUrl } from '../../api'
import { confirmDeleteEagleItem } from '../../components/confirmDeleteModal'
import { useEagleStore } from '../../store'
import {
  clearOrganizeResultClassification,
  confirmOrganizeResultsBatch,
  fetchOrganizeResult,
  fetchOrganizeResults,
  retryOrganizeResult,
  skipOrganizeResult,
} from '../api'
import { ActionBar } from './ActionBar'
import { DetailPanel } from './DetailPanel'
import {
  ThumbnailBar,
  sortOrganizeResults,
  type OrganizeSortType,
} from './ThumbnailBar'
import { useManualFolders } from './useManualFolders'

const CONFIRM_SORT_STORAGE_KEY = 'eagle_organize_confirm_sort'

interface PendingConfirmItem {
  itemId: string
  folderPath: string
  withTitle: boolean
  folderId?: string
  originalItem: OrganizeResultListItem
  index: number
}

// 步骤 3 结果确认：纯净查验判定成功的结果（status === 'success'）
// 顶部缩略图条 + 左大图右信息面板 + 底部操作（A/S/D 与重新执行）
// 完成当前结果后自动选中下一张；重新执行单图送回步骤 2 队列，步骤 3 继续确认下一张
export function StepConfirm({
  onSwitchToRunning,
}: {
  onSwitchToRunning?: () => void
}) {
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
  const folders = useEagleStore((s) => s.folders)
  const [detail, setDetail] = useState<OrganizeResultDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [titleDisabledIds, setTitleDisabledIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [selectedOptionKeys, setSelectedOptionKeys] = useState<
    Record<string, string>
  >({})

  const resultsRef = useRef<OrganizeResultListItem[]>([])
  const preloadedIdsRef = useRef(new Set<string>())
  const preloadImagesRef = useRef<HTMLImageElement[]>([])
  const pendingBatchRef = useRef<PendingConfirmItem[]>([])
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFlushingRef = useRef(false)

  const handleSortTypeChange = useCallback(
    (newSort: OrganizeSortType) => {
      setSortType(newSort)
      try {
        localStorage.setItem(CONFIRM_SORT_STORAGE_KEY, newSort)
      } catch {
        // 忽略损坏的本地缓存
      }
      const nextSorted = sortOrganizeResults(
        resultsRef.current,
        newSort,
        folders,
      )
      resultsRef.current = nextSorted
      setResults(nextSorted)
      setSelectedId(nextSorted[0]?.itemId ?? null)
    },
    [folders],
  )

  const {
    manualFolders,
    sortedManualFolders,
    handleManualFolderSelect,
    handleRemoveManualFolder,
    recordManualFolderUsage,
  } = useManualFolders({
    selectedId,
    setSelectedOptionKeys,
  })

  // 仅拉取判定成功的结果，按当前排序规则组织队列
  const refreshResults = useCallback(async (): Promise<
    OrganizeResultListItem[]
  > => {
    const succeeded = await fetchOrganizeResults('success')
    const sorted = sortOrganizeResults(succeeded, sortType, folders)
    resultsRef.current = sorted
    setResults(sorted)
    return sorted
  }, [folders, sortType])

  // 仅在挂载时拉取一次；确认操作成功后在本地移除，避免每次 SSE 都重拉列表
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

  // 预加载接下来两张原图（已加载过的自动跳过，避免重复发起请求）
  useEffect(() => {
    if (!selectedId || results.length === 0) return
    preloadedIdsRef.current.add(selectedId)
    const currentIndex = results.findIndex((item) => item.itemId === selectedId)
    if (currentIndex === -1) return
    const nextItems = results.slice(currentIndex + 1, currentIndex + 3)
    nextItems.forEach((item) => {
      if (!preloadedIdsRef.current.has(item.itemId)) {
        preloadedIdsRef.current.add(item.itemId)
        const img = new window.Image()
        img.src = eagleFileUrl(item.itemId)
        preloadImagesRef.current.push(img)
        if (preloadImagesRef.current.length > 20) {
          preloadImagesRef.current.shift()
        }
      }
    })
  }, [selectedId, results])

  // 选中项变化时拉取详情
  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      return
    }
    let cancelled = false
    setDetailLoading(true)
    fetchOrganizeResult(selectedId)
      .then((data) => {
        if (!cancelled) setDetail(data)
      })
      .catch((error) => {
        console.error('拉取结果详情失败', error)
        if (!cancelled) setDetail(null)
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedId])

  const folderPaths = detail?.folderPaths ?? []

  // 若手动选择的文件夹已出现在当前图片的 AI 推荐选项中，则不在下方重复展示
  const displayedManualFolders = useMemo(() => {
    const aiPathSet = new Set(folderPaths)
    return sortedManualFolders.filter((m) => !aiPathSet.has(m.folderPath))
  }, [folderPaths, sortedManualFolders])

  // 当前选中项的唯一 key（例如 "ai:角色/插画" 或 "manual:folderId"）
  const activeOptionKey = selectedId
    ? (selectedOptionKeys[selectedId] ??
      (folderPaths[0] ? `ai:${folderPaths[0]}` : null))
    : null

  const selectedManualFolder = useMemo(() => {
    if (!activeOptionKey?.startsWith('manual:')) return null
    const folderId = activeOptionKey.slice('manual:'.length)
    return manualFolders.find((f) => f.folderId === folderId) ?? null
  }, [activeOptionKey, manualFolders])

  const selectedFolderPath = useMemo(() => {
    if (!activeOptionKey) return null
    if (activeOptionKey.startsWith('ai:')) {
      return activeOptionKey.slice('ai:'.length)
    }
    if (activeOptionKey.startsWith('manual:')) {
      return selectedManualFolder?.folderPath ?? null
    }
    return null
  }, [activeOptionKey, selectedManualFolder])

  const canConfirm = detail?.status === 'success' && !!selectedFolderPath
  const withTitle = selectedId ? !titleDisabledIds.has(selectedId) : true

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
      // 发生错误时回退未成功的条目到待确认列表
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

  const runAction = useCallback(
    async (fn: (itemId: string) => Promise<void>) => {
      if (!selectedId || actionLoading) return
      const itemId = selectedId
      setActionLoading(true)
      try {
        // 先冲刷待确认队列中的项目，保证操作时序
        await flushPendingBatch()
        await fn(itemId)
        const current = resultsRef.current
        const index = current.findIndex((result) => result.itemId === itemId)
        const remaining = current.filter((result) => result.itemId !== itemId)
        const nextId = remaining[index]?.itemId ?? remaining[0]?.itemId ?? null
        resultsRef.current = remaining
        setResults(remaining)
        setSelectedId(nextId)
      } catch (error) {
        message.error(error instanceof Error ? error.message : '操作失败')
      } finally {
        setActionLoading(false)
      }
    },
    [actionLoading, flushPendingBatch, selectedId],
  )

  const runConfirm = useCallback(async () => {
    if (!selectedId || !selectedFolderPath || !canConfirm || actionLoading) {
      return
    }

    const itemId = selectedId
    const current = resultsRef.current
    const item = current.find((result) => result.itemId === itemId)
    if (!item) return

    const index = current.findIndex((result) => result.itemId === itemId)
    const remaining = current.filter((result) => result.itemId !== itemId)
    const nextId = remaining[index]?.itemId ?? remaining[0]?.itemId ?? null

    // 检查是否为手动选择的文件夹，如果是则计数 +1 并持久化
    if (selectedManualFolder) {
      recordManualFolderUsage(selectedManualFolder.folderId)
    }

    // 立即乐观切换下一张，界面无卡顿响应
    resultsRef.current = remaining
    setResults(remaining)
    setSelectedId(nextId)

    // 加入待确认批次队列
    pendingBatchRef.current.push({
      itemId,
      folderPath: selectedFolderPath,
      withTitle,
      folderId: selectedManualFolder?.folderId,
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
  }, [
    actionLoading,
    canConfirm,
    flushPendingBatch,
    recordManualFolderUsage,
    selectedFolderPath,
    selectedId,
    selectedManualFolder,
    withTitle,
  ])

  const handleDelete = useCallback(() => {
    if (!selectedId || actionLoading) return
    confirmDeleteEagleItem({
      name: detail?.itemName,
      onConfirm: () =>
        runAction(async (itemId) => {
          await deleteEagleItem(itemId)
          await skipOrganizeResult(itemId)
          message.success('已移至回收站')
        }),
    })
  }, [actionLoading, detail?.itemName, runAction, selectedId])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          (target instanceof HTMLInputElement &&
            !['radio', 'checkbox'].includes(target.type)))
      ) {
        return
      }

      if (event.key.toLowerCase() === 'a') {
        event.preventDefault()
        void runAction(clearOrganizeResultClassification)
      } else if (event.key.toLowerCase() === 's') {
        event.preventDefault()
        void runAction(skipOrganizeResult)
      } else if (event.key.toLowerCase() === 'd') {
        event.preventDefault()
        void runConfirm()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [runAction, runConfirm])

  if (loading && results.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spin />
      </div>
    )
  }

  if (results.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <Empty description="暂无待确认结果" />
        {onSwitchToRunning && (
          <Button type="link" size="small" onClick={onSwitchToRunning}>
            返回步骤 02 查看队列进度
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-3">
      {/* 顶部待确认缩略图条 */}
      <ThumbnailBar
        results={results}
        selectedId={selectedId}
        onSelect={setSelectedId}
        sortType={sortType}
        onSortTypeChange={handleSortTypeChange}
      />

      {/* 中部：左大图 + 右信息面板 */}
      <div className="grid min-h-0 flex-1 grid-cols-[6fr_4fr] gap-3">
        <div className="flex h-full items-center justify-center overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800/60">
          {selectedId && (
            <Image
              key={selectedId}
              src={eagleFileUrl(selectedId)}
              classNames={{
                root: 'h-full w-full flex items-center justify-center',
                image: 'h-full! w-full! object-contain!',
              }}
              preview={{ src: eagleFileUrl(selectedId) }}
            />
          )}
        </div>

        <DetailPanel
          loading={detailLoading}
          detail={detail}
          withTitle={withTitle}
          onToggleTitle={(checked) => {
            if (!selectedId) return
            setTitleDisabledIds((current) => {
              const next = new Set(current)
              if (checked) next.delete(selectedId)
              else next.add(selectedId)
              return next
            })
          }}
          activeOptionKey={activeOptionKey}
          onSelectOptionKey={(key) => {
            if (!selectedId) return
            setSelectedOptionKeys((current) => ({
              ...current,
              [selectedId]: key,
            }))
          }}
          folderPaths={folderPaths}
          displayedManualFolders={displayedManualFolders}
          onRemoveManualFolder={handleRemoveManualFolder}
          onManualFolderSelect={handleManualFolderSelect}
        />
      </div>

      {/* 底部操作：移到回收站 / 清除分类 / 不处理 / 重新执行 / 确认 */}
      <ActionBar
        selectedId={selectedId}
        canConfirm={canConfirm}
        actionLoading={actionLoading}
        onDelete={handleDelete}
        onClearClassification={() =>
          runAction(clearOrganizeResultClassification)
        }
        onSkip={() => runAction(skipOrganizeResult)}
        onRetry={() => runAction(retryOrganizeResult)}
        onConfirm={() => void runConfirm()}
      />
    </div>
  )
}
