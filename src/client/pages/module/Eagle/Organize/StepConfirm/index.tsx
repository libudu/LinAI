import type { EagleManualFolderItem } from '@/server/module/eagle/settings'
import type {
  OrganizeResultListItem,
  OrganizeTaskView,
} from '@/shared/eagle/organize'
import { Button, Empty, Spin, message } from 'antd'
import { useCallback, useMemo, useState } from 'react'
import { deleteEagleItem } from '../../api'
import { confirmDeleteEagleItem } from '../../components/confirmDeleteModal'
import { useEagleStore } from '../../store'
import {
  clearOrganizeResultClassification,
  retryOrganizeResult,
  skipOrganizeResult,
} from '../api'
import { ActionBar } from './components/ActionBar'
import { ConfirmControls } from './components/ConfirmControls'
import { ConfirmImageViewer } from './components/ConfirmImageViewer'
import { DetailPanel } from './components/DetailPanel'
import { QuickConfirmList } from './components/QuickConfirmList'
import { ThumbnailBar } from './components/ThumbnailBar'
import { useConfirmQueue } from './hooks/useConfirmQueue'
import { useConfirmShortcuts } from './hooks/useConfirmShortcuts'
import { useManualFolders } from './hooks/useManualFolders'
import { useOrganizePreload } from './hooks/useOrganizePreload'
import type { PinnedFolderOption } from './types'
import {
  CONFIRM_QUICK_MODE_STORAGE_KEY,
  getSavedPinnedOption,
  savePinnedOption,
} from './utils/storage'

// 步骤 3 结果确认：纯净查验判定成功的结果（status === 'success'）
// 普通模式（顶部缩略图条 + 左大图右信息面板 + 底部快捷操作）与快速模式（居中放大列表 + 卡片底部直接确定）
// 预加载后续 5 张大图与详情（普通模式），重新执行不打断确认流
export function StepConfirm({
  task,
  onSwitchToRunning,
}: {
  task?: OrganizeTaskView | null
  onSwitchToRunning?: () => void
}) {
  const folders = useEagleStore((s) => s.folders)
  const [quickMode, setQuickMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(CONFIRM_QUICK_MODE_STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })

  const [titleDisabledIds, setTitleDisabledIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [selectedOptionKeys, setSelectedOptionKeys] = useState<
    Record<string, string>
  >({})
  const [pinnedOption, setPinnedOption] = useState<PinnedFolderOption | null>(
    () => getSavedPinnedOption(task?.createdAt),
  )

  const handleQuickModeChange = useCallback((newQuickMode: boolean) => {
    setQuickMode(newQuickMode)
    try {
      localStorage.setItem(CONFIRM_QUICK_MODE_STORAGE_KEY, String(newQuickMode))
    } catch {
      // 忽略损坏的本地缓存
    }
  }, [])

  // 1. 结果列表与批次防抖调度队列
  const {
    results,
    selectedId,
    setSelectedId,
    selectedItem,
    loading,
    sortType,
    handleSortTypeChange,
    confirmItemQuick,
    confirmCurrentItem,
    runAction,
  } = useConfirmQueue({
    taskCreatedAt: task?.createdAt,
    folders,
  })

  // 2. 详情拉取与原图预加载对象池
  const { detail, detailLoading } = useOrganizePreload({
    results,
    selectedId,
    quickMode,
  })

  // 3. 手动选择文件夹历史
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

  // 4. 目标文件夹与选项计算
  const folderPaths = detail?.folderPaths ?? []

  // 若手动选择的文件夹已出现在当前图片的 AI 推荐选项中，则不在下方重复展示
  const displayedManualFolders = useMemo(() => {
    const aiPathSet = new Set(folderPaths)
    return sortedManualFolders.filter((m) => !aiPathSet.has(m.folderPath))
  }, [folderPaths, sortedManualFolders])

  // 当前选中项的唯一 key（例如 "ai:角色/插画" 或 "manual:folderId"）
  const defaultOptionKey = pinnedOption
    ? pinnedOption.key
    : folderPaths[0]
      ? `ai:${folderPaths[0]}`
      : null

  const activeOptionKey = selectedId
    ? (selectedOptionKeys[selectedId] ?? defaultOptionKey)
    : null

  const selectedManualFolder = useMemo(() => {
    if (!activeOptionKey?.startsWith('manual:')) return null
    const folderId = activeOptionKey.slice('manual:'.length)
    const found = manualFolders.find((f) => f.folderId === folderId)
    if (found) return found
    if (pinnedOption?.folderId === folderId) {
      return {
        folderId: pinnedOption.folderId,
        folderPath: pinnedOption.folderPath,
        count: pinnedOption.count ?? 0,
      }
    }
    return null
  }, [activeOptionKey, manualFolders, pinnedOption])

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

  const handleTogglePin = useCallback(
    (option: PinnedFolderOption) => {
      setPinnedOption((current) => {
        const isUnpinning = current?.key === option.key
        const next = isUnpinning ? null : option
        savePinnedOption(task?.createdAt, next)

        if (selectedId) {
          if (isUnpinning) {
            // 取消置顶时，自动选中当前图片推荐选项的第一个
            const firstRecommendedKey = folderPaths[0]
              ? `ai:${folderPaths[0]}`
              : null
            setSelectedOptionKeys((keys) => {
              const copy = { ...keys }
              if (firstRecommendedKey) {
                copy[selectedId] = firstRecommendedKey
              } else {
                delete copy[selectedId]
              }
              return copy
            })
          } else {
            setSelectedOptionKeys((keys) => ({
              ...keys,
              [selectedId]: option.key,
            }))
          }
        }

        return next
      })
    },
    [folderPaths, selectedId, task?.createdAt],
  )

  const onRemoveManualFolder = useCallback(
    (folder: EagleManualFolderItem) => {
      handleRemoveManualFolder(folder)
      if (pinnedOption?.folderId === folder.folderId) {
        setPinnedOption(null)
        savePinnedOption(task?.createdAt, null)
        if (selectedId) {
          const firstRecommendedKey = folderPaths[0]
            ? `ai:${folderPaths[0]}`
            : null
          setSelectedOptionKeys((keys) => {
            const copy = { ...keys }
            if (firstRecommendedKey) {
              copy[selectedId] = firstRecommendedKey
            } else {
              delete copy[selectedId]
            }
            return copy
          })
        }
      }
    },
    [
      folderPaths,
      handleRemoveManualFolder,
      pinnedOption?.folderId,
      selectedId,
      task?.createdAt,
    ],
  )

  const canConfirm = Boolean(
    !detailLoading &&
    detail &&
    detail.itemId === selectedId &&
    detail.status === 'success' &&
    selectedFolderPath,
  )
  const withTitle = selectedId ? !titleDisabledIds.has(selectedId) : true

  // 5. 确认操作分流
  const handleRunConfirm = useCallback(async () => {
    // 快速模式：直接按首选推荐分类确认当前选中项
    if (quickMode) {
      if (selectedItem) {
        confirmItemQuick(selectedItem, !titleDisabledIds.has(selectedItem.itemId))
      }
      return
    }

    if (!selectedId || !selectedFolderPath || !canConfirm) {
      return
    }

    // 检查是否为手动选择的文件夹，如果是则计数 +1 并持久化
    if (selectedManualFolder) {
      recordManualFolderUsage(selectedManualFolder.folderId)
    }

    confirmCurrentItem({
      folderPath: selectedFolderPath,
      withTitle,
      folderId: selectedManualFolder?.folderId,
    })
  }, [
    canConfirm,
    confirmCurrentItem,
    confirmItemQuick,
    quickMode,
    recordManualFolderUsage,
    selectedFolderPath,
    selectedId,
    selectedItem,
    selectedManualFolder,
    titleDisabledIds,
    withTitle,
  ])

  // 6. 移到回收站操作
  const handleDelete = useCallback(() => {
    if (!selectedId) return
    confirmDeleteEagleItem({
      name: detail?.itemName,
      onConfirm: () =>
        runAction(async (itemId) => {
          try {
            await deleteEagleItem(itemId)
          } catch {
            // 若外部已删除则容错继续标记跳过
          }
          await skipOrganizeResult(itemId)
          message.success('已移至回收站')
        }),
    })
  }, [detail?.itemName, runAction, selectedId])

  // 7. 绑定快捷键（A: 清除分类, S: 不处理, D: 确认）
  useConfirmShortcuts({
    onClear: () => runAction(clearOrganizeResultClassification),
    onSkip: () => runAction(skipOrganizeResult),
    onConfirm: () => void handleRunConfirm(),
    disabled: results.length === 0,
  })

  const handleClearClassification = useCallback(
    (item: OrganizeResultListItem) => {
      void runAction(clearOrganizeResultClassification, item.itemId)
    },
    [runAction],
  )

  const handleSkipItem = useCallback(
    (item: OrganizeResultListItem) => {
      void runAction(skipOrganizeResult, item.itemId)
    },
    [runAction],
  )

  const handleQuickItemConfirm = useCallback(
    (item: OrganizeResultListItem) => {
      confirmItemQuick(item, !titleDisabledIds.has(item.itemId))
    },
    [confirmItemQuick, titleDisabledIds],
  )

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
    <div className="flex h-full min-h-0 flex-col gap-3">
      {quickMode ? (
        <>
          {/* 快速模式头部控件栏 */}
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200/80 pb-2 dark:border-slate-700/80">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                ⚡ 快速整理模式
              </span>
              <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                待确认 {results.length} 张
              </span>
            </div>

            <ConfirmControls
              sortType={sortType}
              onSortTypeChange={handleSortTypeChange}
              quickMode={quickMode}
              onQuickModeChange={handleQuickModeChange}
            />
          </div>

          {/* 快速模式居中放大的图片卡片列表 */}
          <QuickConfirmList
            results={results}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onConfirmItem={handleQuickItemConfirm}
            onClearClassification={handleClearClassification}
            onSkipItem={handleSkipItem}
            sortType={sortType}
          />
        </>
      ) : (
        <>
          {/* 顶部待确认缩略图条 */}
          <ThumbnailBar
            results={results}
            selectedId={selectedId}
            onSelect={setSelectedId}
            sortType={sortType}
            onSortTypeChange={handleSortTypeChange}
            quickMode={quickMode}
            onQuickModeChange={handleQuickModeChange}
          />

          {/* 中部：左大图 + 右信息面板 */}
          <div className="grid min-h-0 flex-1 grid-cols-[6fr_4fr] gap-3">
            <ConfirmImageViewer
              selectedId={selectedId}
              item={selectedItem}
              detail={detail}
            />

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
              onRemoveManualFolder={onRemoveManualFolder}
              onManualFolderSelect={handleManualFolderSelect}
              pinnedOption={pinnedOption}
              onTogglePin={handleTogglePin}
            />
          </div>

          {/* 底部操作：移到回收站 / 清除分类 / 不处理 / 重新执行 / 确认 */}
          <ActionBar
            selectedId={selectedId}
            canConfirm={canConfirm}
            onDelete={handleDelete}
            onClearClassification={() =>
              runAction(clearOrganizeResultClassification)
            }
            onSkip={() => runAction(skipOrganizeResult)}
            onRetry={() => runAction(retryOrganizeResult)}
            onConfirm={() => void handleRunConfirm()}
          />
        </>
      )}
    </div>
  )
}
