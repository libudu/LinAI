import type {
  OrganizeResultListItem,
  OrganizeTaskView,
} from '@/shared/eagle/organize'
import { Button, Empty, Spin } from 'antd'
import { useCallback, useMemo, useState } from 'react'
import { confirmDeleteEagleItem } from '../../components/confirmDeleteModal'
import { VideoPreview } from '../../components/VideoPreview'
import { buildFolderMap, collectFolderKeys, findFolder } from '../../folders'
import { useEagleStore } from '../../store'
import { useOrganizeApi } from '../api'
import { useOrganizeMedia } from '../media'
import { ActionBar, ConfirmActions } from './components/ActionBar'
import { ConfirmControls } from './components/ConfirmControls'
import { ConfirmImageViewer } from './components/ConfirmImageViewer'
import { DetailPanel } from './components/DetailPanel'
import { QuickConfirmList } from './components/QuickConfirmList'
import { ThumbnailBar } from './components/ThumbnailBar'
import { useConfirmQueue } from './hooks/useConfirmQueue'
import { useConfirmSelection } from './hooks/useConfirmSelection'
import { useConfirmShortcuts } from './hooks/useConfirmShortcuts'
import { useOrganizePreload } from './hooks/useOrganizePreload'
import { CONFIRM_QUICK_MODE_STORAGE_KEY } from './utils/storage'

// 步骤 3 结果确认：纯净查验判定成功的结果（status === 'success'）
// 普通模式（顶部缩略图条 + 左大图右信息面板 + 底部快捷操作）与快速模式（居中放大列表 + 卡片底部直接确定）
// 预加载后续 5 个大图与详情（普通模式），重新执行不打断确认流
export function StepConfirm({
  task,
  onSwitchToRunning,
}: {
  task?: OrganizeTaskView | null
  onSwitchToRunning?: () => void
}) {
  const {
    clearOrganizeResultClassification,
    retryOrganizeResult,
    skipOrganizeResult,
  } = useOrganizeApi()
  const folders = useEagleStore((s) => s.folders)
  const { mediaType } = useOrganizeMedia()
  const [videoPreviewOpen, setVideoPreviewOpen] = useState(false)
  const [videoPreviewSaving, setVideoPreviewSaving] = useState(false)
  const renameOnly = task?.classificationMode === 'recursive-rename'
  const manualFolderScope = useMemo(() => {
    if (task?.classificationMode !== 'subfolders') return undefined
    const parent = task.folderId ? findFolder(folders, task.folderId) : null
    const descendantIds = new Set(collectFolderKeys(parent?.children ?? []))
    return [...buildFolderMap(folders).values()].filter((folder) =>
      descendantIds.has(folder.id),
    )
  }, [folders, task?.classificationMode, task?.folderId])
  const [quickMode, setQuickMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(CONFIRM_QUICK_MODE_STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })

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
    pinnedCategory,
    handlePinnedCategoryChange,
    confirmItemQuick,
    confirmCurrentItem,
    runAction,
    trashItem,
  } = useConfirmQueue({
    taskId: task?.taskId,
    taskCreatedAt: task?.createdAt,
    folders,
    standards: task?.standards,
    renameOnly,
  })

  // 2. 详情拉取与原图预加载对象池
  const { detail, detailLoading } = useOrganizePreload({
    results,
    selectedId,
    quickMode: quickMode && !videoPreviewOpen,
  })

  // 预览跟随确认列表的选中项；下一项详情加载期间保持弹窗打开。
  const videoItem =
    mediaType === 'video' &&
    selectedId &&
    detail?.itemId === selectedId &&
    detail.itemName !== null &&
    detail.itemExt &&
    detail.contentVersion &&
    detail.size !== undefined
      ? {
          id: selectedId,
          name: detail.itemName,
          ext: detail.itemExt,
          contentVersion: detail.contentVersion,
          size: detail.size,
          mtime: detail.mtime,
          width: detail.width,
          height: detail.height,
        }
      : null

  const handlePreviewVideo = useCallback(
    (itemId: string) => {
      if (videoPreviewSaving) return
      setSelectedId(itemId)
      setVideoPreviewOpen(true)
    },
    [setSelectedId, videoPreviewSaving],
  )

  const {
    folderPaths,
    folderIds,
    displayedManualFolders,
    activeOptionKey,
    selectedManualFolder,
    selectedFolderPath,
    selectedFolderId,
    pinnedOption,
    handleTogglePin,
    onManualFolderSelect,
    onRemoveManualFolder,
    selectOption,
    recordManualFolderUsage,
    isTitleEnabled,
    handleToggleTitle,
    withTitle,
  } = useConfirmSelection({
    taskId: task?.taskId,
    taskCreatedAt: task?.createdAt,
    selectedId,
    folderPaths: detail?.folderPaths,
    folderIds: detail?.folderIds,
    standards: task?.standards,
    needsRename: detail?.needsRename,
    manualFolderScope,
  })

  const canConfirm = Boolean(
    !detailLoading &&
    detail &&
    detail.itemId === selectedId &&
    detail.status === 'success' &&
    (renameOnly || selectedFolderPath),
  )

  // 5. 确认操作分流
  const handleRunConfirm = useCallback(async () => {
    if (videoPreviewSaving || (videoPreviewOpen && !videoItem)) return
    // 快速模式：直接按首选推荐分类确认当前选中项
    if (quickMode) {
      if (selectedItem) {
        confirmItemQuick(selectedItem, isTitleEnabled(selectedItem.itemId))
      }
      return
    }

    if (!selectedId || (!renameOnly && !selectedFolderPath) || !canConfirm) {
      return
    }

    // 检查是否为手动选择的文件夹，如果是则计数 +1 并持久化
    if (!renameOnly && selectedManualFolder) {
      recordManualFolderUsage(selectedManualFolder)
    }

    confirmCurrentItem({
      folderPath: renameOnly ? '未分类' : selectedFolderPath!,
      withTitle,
      folderId: renameOnly ? undefined : selectedFolderId,
    })
  }, [
    canConfirm,
    renameOnly,
    confirmCurrentItem,
    confirmItemQuick,
    quickMode,
    recordManualFolderUsage,
    selectedFolderPath,
    selectedFolderId,
    selectedId,
    selectedItem,
    selectedManualFolder,
    isTitleEnabled,
    withTitle,
    videoPreviewSaving,
    videoPreviewOpen,
    videoItem,
  ])

  // 6. 移到回收站操作
  const handleDelete = useCallback(() => {
    if (!selectedId) return
    confirmDeleteEagleItem({
      name: detail?.itemName,
      onConfirm: () => trashItem(selectedId),
    })
  }, [detail?.itemName, selectedId, trashItem])

  const handleClearCurrentClassification = useCallback(() => {
    if (renameOnly || videoPreviewSaving || (videoPreviewOpen && !videoItem))
      return
    void runAction(clearOrganizeResultClassification)
  }, [renameOnly, runAction, videoPreviewSaving, videoPreviewOpen, videoItem])

  // 7. 绑定快捷键（A: 移至未分类, S: 不处理, D: 确认）
  useConfirmShortcuts({
    onClear: handleClearCurrentClassification,
    onSkip: () => runAction(skipOrganizeResult),
    onConfirm: () => void handleRunConfirm(),
    disabled:
      results.length === 0 ||
      videoPreviewSaving ||
      (videoPreviewOpen && !videoItem),
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
      confirmItemQuick(item, isTitleEnabled(item.itemId))
    },
    [confirmItemQuick, isTitleEnabled],
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
          {/* 快速模式标题与待确认数量 */}
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200/80 pb-2 dark:border-slate-700/80">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                ⚡ 快速整理模式
              </span>
              <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                待确认 {results.length} 个
              </span>
            </div>
          </div>

          {/* 左侧工具栏与快速模式图片卡片列表 */}
          <div className="flex min-h-0 flex-1 items-center gap-2">
            <ConfirmControls
              renameOnly={renameOnly}
              sortType={sortType}
              onSortTypeChange={handleSortTypeChange}
              quickMode={quickMode}
              onQuickModeChange={handleQuickModeChange}
              results={results}
              pinnedCategory={pinnedCategory}
              onPinnedCategoryChange={handlePinnedCategoryChange}
            />
            <QuickConfirmList
              results={results}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onPreviewVideo={handlePreviewVideo}
              onConfirmItem={handleQuickItemConfirm}
              onClearClassification={
                renameOnly ? undefined : handleClearClassification
              }
              onSkipItem={handleSkipItem}
              sortType={sortType}
              pinnedCategory={pinnedCategory}
            />
          </div>
        </>
      ) : (
        <>
          {/* 顶部待确认缩略图条 */}
          <ThumbnailBar
            renameOnly={renameOnly}
            results={results}
            selectedId={selectedId}
            onSelect={setSelectedId}
            sortType={sortType}
            onSortTypeChange={handleSortTypeChange}
            quickMode={quickMode}
            onQuickModeChange={handleQuickModeChange}
            pinnedCategory={pinnedCategory}
            onPinnedCategoryChange={handlePinnedCategoryChange}
          />

          {/* 中部：左大图 + 右信息面板 */}
          <div className="grid min-h-0 flex-1 grid-cols-[6fr_4fr] gap-3">
            <ConfirmImageViewer
              selectedId={selectedId}
              item={selectedItem}
              detail={detail}
              onPreviewVideo={() => {
                if (selectedId) handlePreviewVideo(selectedId)
              }}
            />

            <DetailPanel
              renameOnly={renameOnly}
              loading={detailLoading}
              detail={detail}
              withTitle={withTitle}
              onToggleTitle={handleToggleTitle}
              activeOptionKey={activeOptionKey}
              onSelectOptionKey={selectOption}
              folderPaths={folderPaths}
              folderIds={folderIds}
              displayedManualFolders={displayedManualFolders}
              onRemoveManualFolder={onRemoveManualFolder}
              onManualFolderSelect={onManualFolderSelect}
              pinnedOption={pinnedOption}
              onTogglePin={handleTogglePin}
            />
          </div>

          {/* 底部操作：移到回收站 / 移至未分类 / 不处理 / 重新执行 / 确认 */}
          <ActionBar
            selectedId={selectedId}
            canConfirm={canConfirm}
            onDelete={handleDelete}
            onClearClassification={
              renameOnly ? undefined : handleClearCurrentClassification
            }
            onSkip={() => runAction(skipOrganizeResult)}
            onRetry={() => runAction(retryOrganizeResult)}
            onConfirm={() => void handleRunConfirm()}
          />
        </>
      )}
      {mediaType === 'video' && (
        <VideoPreview
          open={videoPreviewOpen && Boolean(selectedId)}
          loading={detailLoading}
          item={videoPreviewOpen ? videoItem : null}
          onClose={() => setVideoPreviewOpen(false)}
          onBusyChange={setVideoPreviewSaving}
          toolbarExtra={
            <ConfirmActions
              selectedId={selectedId}
              canConfirm={quickMode ? Boolean(selectedItem) : canConfirm}
              disabled={videoPreviewSaving || !videoItem}
              onClearClassification={
                renameOnly ? undefined : handleClearCurrentClassification
              }
              onConfirm={() => void handleRunConfirm()}
            />
          }
        />
      )}
    </div>
  )
}
