import type { SelectedFolderInfo } from '@/client/pages/module/Eagle/folders'
import type { EagleManualFolderItem } from '@/client/pages/module/Eagle/preferenceTypes'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PinnedFolderOption } from '../types'
import { getSavedPinnedOption, savePinnedOption } from '../utils/storage'
import { useManualFolders } from './useManualFolders'

const EMPTY_PATHS: string[] = []

/** 每图目标、默认推荐、置顶与标题开关；手动历史仍由 useManualFolders 保存。 */
export function useConfirmSelection({
  taskCreatedAt,
  selectedId,
  folderPaths: recommendedFolderPaths = EMPTY_PATHS,
  needsRename = true,
  manualFolderScope,
}: {
  taskCreatedAt?: number
  selectedId: string | null
  folderPaths?: string[]
  needsRename?: boolean
  manualFolderScope?: SelectedFolderInfo[]
}) {
  const folderPaths = useMemo(() => {
    if (!manualFolderScope) return recommendedFolderPaths
    const scopePaths = new Set(manualFolderScope.map((folder) => folder.path))
    return recommendedFolderPaths.filter((path) => scopePaths.has(path))
  }, [recommendedFolderPaths, manualFolderScope])
  const [titleDisabledIds, setTitleDisabledIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [selectedOptionKeys, setSelectedOptionKeys] = useState<
    Record<string, string>
  >({})
  const [pinnedOption, setPinnedOption] = useState<PinnedFolderOption | null>(
    () => getSavedPinnedOption(taskCreatedAt),
  )
  const {
    manualFolders,
    sortedManualFolders,
    handleManualFolderSelect,
    handleRemoveManualFolder,
    recordManualFolderUsage,
  } = useManualFolders()

  useEffect(() => {
    setTitleDisabledIds(new Set())
    setSelectedOptionKeys({})
    setPinnedOption(getSavedPinnedOption(taskCreatedAt))
  }, [taskCreatedAt])

  const defaultOptionKey =
    pinnedOption?.key ?? (folderPaths[0] ? `ai:${folderPaths[0]}` : null)
  const activeOptionKey = selectedId
    ? (selectedOptionKeys[selectedId] ?? defaultOptionKey)
    : null
  const availableManualFolders = useMemo(() => {
    if (!manualFolderScope) return sortedManualFolders
    const history = new Map(
      manualFolders.map((folder) => [folder.folderId, folder]),
    )
    const scoped = manualFolderScope.map((folder) => ({
      folderId: folder.id,
      folderPath: folder.path,
      count: history.get(folder.id)?.count ?? 0,
    }))
    const scopeIds = new Set(scoped.map((folder) => folder.folderId))
    // 全库弹窗显式选中的范围外目录仍可用于当前图片或置顶复用。
    for (const folder of manualFolders) {
      if (
        !scopeIds.has(folder.folderId) &&
        (activeOptionKey === `manual:${folder.folderId}` ||
          pinnedOption?.folderId === folder.folderId)
      ) {
        scoped.push(folder)
      }
    }
    return scoped.sort((a, b) => b.count - a.count)
  }, [
    manualFolderScope,
    sortedManualFolders,
    manualFolders,
    activeOptionKey,
    pinnedOption,
  ])
  const displayedManualFolders = useMemo(() => {
    const recommended = new Set(folderPaths)
    return availableManualFolders.filter(
      (folder) => !recommended.has(folder.folderPath),
    )
  }, [folderPaths, availableManualFolders])
  const selectedManualFolder = useMemo(() => {
    if (!activeOptionKey?.startsWith('manual:')) return null
    const folderId = activeOptionKey.slice('manual:'.length)
    const found = availableManualFolders.find(
      (folder) => folder.folderId === folderId,
    )
    if (found) return found
    if (pinnedOption?.folderId === folderId) {
      return {
        folderId,
        folderPath: pinnedOption.folderPath,
        count: pinnedOption.count ?? 0,
      }
    }
    return null
  }, [activeOptionKey, availableManualFolders, pinnedOption])
  const selectedFolderPath = activeOptionKey?.startsWith('ai:')
    ? activeOptionKey.slice('ai:'.length)
    : (selectedManualFolder?.folderPath ?? null)

  const selectOption = useCallback(
    (key: string | null) => {
      if (!selectedId) return
      setSelectedOptionKeys((current) => {
        const next = { ...current }
        if (key) next[selectedId] = key
        else delete next[selectedId]
        return next
      })
    },
    [selectedId],
  )
  const selectRecommended = useCallback(() => {
    selectOption(folderPaths[0] ? `ai:${folderPaths[0]}` : null)
  }, [folderPaths, selectOption])

  const handleTogglePin = useCallback(
    (option: PinnedFolderOption) => {
      const next = pinnedOption?.key === option.key ? null : option
      setPinnedOption(next)
      savePinnedOption(taskCreatedAt, next)
      if (next) selectOption(next.key)
      else selectRecommended()
    },
    [pinnedOption, taskCreatedAt, selectOption, selectRecommended],
  )

  const onManualFolderSelect = useCallback(
    (folder: SelectedFolderInfo) => {
      handleManualFolderSelect(folder)
      selectOption(
        manualFolderScope && folderPaths.includes(folder.path)
          ? `ai:${folder.path}`
          : `manual:${folder.id}`,
      )
    },
    [handleManualFolderSelect, selectOption, folderPaths, manualFolderScope],
  )

  const onRemoveManualFolder = useCallback(
    (folder: EagleManualFolderItem) => {
      handleRemoveManualFolder(folder)
      if (pinnedOption?.folderId === folder.folderId) {
        setPinnedOption(null)
        savePinnedOption(taskCreatedAt, null)
        selectRecommended()
      } else if (activeOptionKey === `manual:${folder.folderId}`) {
        selectOption(null)
      }
    },
    [
      handleRemoveManualFolder,
      pinnedOption,
      taskCreatedAt,
      selectRecommended,
      activeOptionKey,
      selectOption,
    ],
  )

  const isTitleEnabled = useCallback(
    (itemId: string) => !titleDisabledIds.has(itemId),
    [titleDisabledIds],
  )
  const handleToggleTitle = useCallback(
    (enabled: boolean) => {
      if (!selectedId || !needsRename) return
      setTitleDisabledIds((current) => {
        const next = new Set(current)
        if (enabled) next.delete(selectedId)
        else next.add(selectedId)
        return next
      })
    },
    [selectedId, needsRename],
  )

  return {
    folderPaths,
    displayedManualFolders,
    activeOptionKey,
    selectedManualFolder,
    selectedFolderPath,
    pinnedOption,
    handleTogglePin,
    onManualFolderSelect,
    onRemoveManualFolder,
    selectOption,
    recordManualFolderUsage,
    isTitleEnabled,
    handleToggleTitle,
    withTitle: needsRename && (selectedId ? isTitleEnabled(selectedId) : true),
  }
}
