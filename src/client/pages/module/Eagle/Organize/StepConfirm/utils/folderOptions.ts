import type { EagleManualFolderItem } from '../../../preferenceTypes'
import type { PinnedFolderOption } from '../types'

export interface ConfirmFolderOption extends PinnedFolderOption {
  isPinned: boolean
  manualItem?: EagleManualFolderItem
}

/** 展示与提交共用目标模型；旧选中历史不因推荐变化而丢失。 */
export const buildConfirmFolderOptions = (
  recommendations: Pick<PinnedFolderOption, 'folderId' | 'folderPath'>[],
  manualFolders: EagleManualFolderItem[],
  pinnedOption: PinnedFolderOption | null,
  activeOptionKey: string | null,
) => {
  const recommendedIds = new Set(
    recommendations.map((folder) => folder.folderId),
  )
  const recommendedOptions: ConfirmFolderOption[] = recommendations.map(
    (folder) => ({
      ...folder,
      key: `ai:${folder.folderId ?? folder.folderPath}`,
      type: 'ai',
      isPinned: false,
    }),
  )
  const manualOptions: ConfirmFolderOption[] = manualFolders
    .filter((folder) => !recommendedIds.has(folder.folderId))
    .map((folder) => ({
      ...folder,
      key: `manual:${folder.folderId}`,
      type: 'manual',
      isPinned: false,
      manualItem: folder,
    }))
  const matchesPin = (folder: PinnedFolderOption) =>
    pinnedOption &&
    (pinnedOption.folderId !== undefined
      ? pinnedOption.folderId === folder.folderId
      : pinnedOption.folderPath === folder.folderPath)
  let options = [...recommendedOptions, ...manualOptions]
  if (pinnedOption) {
    const manualItem = manualOptions.find(matchesPin)?.manualItem
    options = [
      {
        ...pinnedOption,
        count: manualItem?.count ?? pinnedOption.count,
        isPinned: true,
        manualItem:
          manualItem ??
          (pinnedOption.folderId
            ? {
                folderId: pinnedOption.folderId,
                folderPath: pinnedOption.folderPath,
                count: pinnedOption.count ?? 0,
              }
            : undefined),
      },
      ...options.filter((folder) => !matchesPin(folder)),
    ]
  }

  let selectedManualFolder: EagleManualFolderItem | null = null
  if (activeOptionKey?.startsWith('manual:')) {
    const folderId = activeOptionKey.slice('manual:'.length)
    selectedManualFolder =
      manualFolders.find((folder) => folder.folderId === folderId) ??
      (pinnedOption?.folderId === folderId
        ? {
            folderId,
            folderPath: pinnedOption.folderPath,
            count: pinnedOption.count ?? 0,
          }
        : null)
  }
  const selectedFolder =
    pinnedOption?.key === activeOptionKey
      ? pinnedOption
      : (recommendedOptions.find((folder) => folder.key === activeOptionKey) ??
        selectedManualFolder)
  return { options, selectedFolder, selectedManualFolder }
}
