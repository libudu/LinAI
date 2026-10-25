import {
  buildFolderMap,
  type SelectedFolderInfo,
} from '@/client/pages/module/Eagle/folders'
import type { EagleManualFolderItem } from '@/client/pages/module/Eagle/preferenceTypes'
import { useEagleStore } from '@/client/pages/module/Eagle/store'
import type { OrganizeFolderStandard } from '@/shared/eagle/organize'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PinnedFolderOption } from '../types'
import { getSavedPinnedOption, savePinnedOption } from '../utils/storage'
import { useManualFolders } from './useManualFolders'

const EMPTY_PATHS: string[] = []
const EMPTY_STANDARDS: OrganizeFolderStandard[] = []

/** 每图目标、默认推荐、置顶与标题开关；手动历史仍由 useManualFolders 保存。 */
export function useConfirmSelection({
  taskId,
  taskCreatedAt,
  selectedId,
  folderPaths: recommendedFolderPaths = EMPTY_PATHS,
  folderIds: recommendedFolderIds = EMPTY_PATHS,
  standards = EMPTY_STANDARDS,
  needsRename = true,
  manualFolderScope,
}: {
  taskId?: string
  taskCreatedAt?: number
  selectedId: string | null
  folderPaths?: string[]
  folderIds?: string[]
  standards?: OrganizeFolderStandard[]
  needsRename?: boolean
  manualFolderScope?: SelectedFolderInfo[]
}) {
  const folders = useEagleStore((state) => state.folders)
  const folderMap = useMemo(() => buildFolderMap(folders), [folders])
  const recommendations = useMemo(() => {
    const scopeIds = manualFolderScope
      ? new Set(manualFolderScope.map((folder) => folder.id))
      : null
    return recommendedFolderPaths.flatMap((path, index) => {
      const folderId = recommendedFolderIds[index]
      if (scopeIds && !scopeIds.has(folderId)) return []
      return [{ folderId, folderPath: folderMap.get(folderId)?.path ?? path }]
    })
  }, [
    recommendedFolderPaths,
    recommendedFolderIds,
    manualFolderScope,
    folderMap,
  ])
  const folderPaths = useMemo(
    () => recommendations.map((folder) => folder.folderPath),
    [recommendations],
  )
  const folderIds = useMemo(
    () => recommendations.map((folder) => folder.folderId),
    [recommendations],
  )
  const [titleDisabledIds, setTitleDisabledIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [selectedOptionKeys, setSelectedOptionKeys] = useState<
    Record<string, string>
  >({})
  const [pinState, setPinState] = useState(() => ({
    taskId,
    option: getSavedPinnedOption(taskId, taskCreatedAt),
  }))
  const savedPinnedOption =
    pinState.taskId === taskId
      ? pinState.option
      : getSavedPinnedOption(taskId, taskCreatedAt)
  const setPinnedOption = useCallback(
    (option: PinnedFolderOption | null) => {
      setPinState({ taskId, option })
    },
    [taskId],
  )
  const pinnedOption = useMemo(() => {
    if (!savedPinnedOption) return null
    const folderId =
      savedPinnedOption.folderId ??
      standards.find(
        (folder) => folder.folderPath === savedPinnedOption.folderPath,
      )?.folderId ??
      [...folderMap.values()].find(
        (folder) => folder.path === savedPinnedOption.folderPath,
      )?.id
    return {
      ...savedPinnedOption,
      folderId,
      folderPath:
        folderMap.get(folderId ?? '')?.path ?? savedPinnedOption.folderPath,
      key: `${savedPinnedOption.type}:${folderId ?? savedPinnedOption.folderPath}`,
    }
  }, [savedPinnedOption, standards, folderMap])
  useEffect(() => {
    if (!pinnedOption) return
    savePinnedOption(taskId, pinnedOption)
    if (pinnedOption.folderId !== savedPinnedOption?.folderId) {
      setPinnedOption(pinnedOption)
    }
  }, [pinnedOption, savedPinnedOption, setPinnedOption, taskId])
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
    setPinnedOption(getSavedPinnedOption(taskId, taskCreatedAt))
  }, [taskId, taskCreatedAt])

  const defaultOptionKey =
    pinnedOption?.key ??
    (folderPaths[0] ? `ai:${folderIds[0] ?? folderPaths[0]}` : null)
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
    const recommended = new Set(folderIds)
    return availableManualFolders.filter(
      (folder) => !recommended.has(folder.folderId),
    )
  }, [folderIds, availableManualFolders])
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
  const selectedRecommendation = activeOptionKey?.startsWith('ai:')
    ? recommendations.find(
        (folder) =>
          `ai:${folder.folderId ?? folder.folderPath}` === activeOptionKey,
      )
    : null
  const selectedFolder =
    pinnedOption?.key === activeOptionKey
      ? pinnedOption
      : (selectedRecommendation ?? selectedManualFolder)
  const selectedFolderPath = selectedFolder?.folderPath ?? null
  const selectedFolderId = selectedFolder?.folderId

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
    selectOption(folderPaths[0] ? `ai:${folderIds[0] ?? folderPaths[0]}` : null)
  }, [folderPaths, folderIds, selectOption])

  const handleTogglePin = useCallback(
    (option: PinnedFolderOption) => {
      const next = pinnedOption?.key === option.key ? null : option
      setPinnedOption(next)
      savePinnedOption(taskId, next)
      if (next) selectOption(next.key)
      else selectRecommended()
    },
    [pinnedOption, taskId, selectOption, selectRecommended],
  )

  const onManualFolderSelect = useCallback(
    (folder: SelectedFolderInfo) => {
      handleManualFolderSelect(folder)
      selectOption(
        folderIds.includes(folder.id)
          ? `ai:${folder.id}`
          : `manual:${folder.id}`,
      )
    },
    [handleManualFolderSelect, selectOption, folderIds],
  )

  const onRemoveManualFolder = useCallback(
    (folder: EagleManualFolderItem) => {
      handleRemoveManualFolder(folder)
      if (pinnedOption?.folderId === folder.folderId) {
        setPinnedOption(null)
        savePinnedOption(taskId, null)
        selectRecommended()
      } else if (activeOptionKey === `manual:${folder.folderId}`) {
        selectOption(null)
      }
    },
    [
      handleRemoveManualFolder,
      pinnedOption,
      taskId,
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
    withTitle: needsRename && (selectedId ? isTitleEnabled(selectedId) : true),
  }
}
