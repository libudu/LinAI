import type { SelectedFolderInfo } from '@/client/pages/module/Eagle/folders'
import { EaglePreferenceDocument } from '@/client/pages/module/Eagle/preferenceDocument'
import type {
  EagleManualFolderItem,
  EagleManualFoldersPreferences,
} from '@/client/pages/module/Eagle/preferenceTypes'
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'

const manualFoldersDocument =
  new EaglePreferenceDocument<EagleManualFoldersPreferences>(
    'eagle.manual-folders',
    { folders: [] },
  )

/** 手动目标历史及使用频次；当前图片的选项由 useConfirmSelection 管理。 */
export function useManualFolders() {
  const {
    value: { folders: manualFolders },
  } = useSyncExternalStore(
    manualFoldersDocument.subscribe,
    manualFoldersDocument.getSnapshot,
  )

  useEffect(() => {
    void manualFoldersDocument
      .load()
      .catch((error) => console.error('加载手动文件夹历史失败', error))
  }, [])

  const updateFolders = useCallback(
    (mutate: (folders: EagleManualFolderItem[]) => EagleManualFolderItem[]) => {
      void manualFoldersDocument
        .update((current) => ({ folders: mutate(current.folders) }))
        .catch((error) => console.error('保存手动文件夹历史失败', error))
    },
    [],
  )

  const handleManualFolderSelect = useCallback(
    (folder: SelectedFolderInfo) => {
      updateFolders((folders) =>
        folders.some((item) => item.folderId === folder.id)
          ? folders
          : [
              ...folders,
              { folderId: folder.id, folderPath: folder.path, count: 0 },
            ],
      )
    },
    [updateFolders],
  )

  const handleRemoveManualFolder = useCallback(
    (target: EagleManualFolderItem) => {
      updateFolders((folders) =>
        folders.filter((item) => item.folderId !== target.folderId),
      )
    },
    [updateFolders],
  )

  const recordManualFolderUsage = useCallback(
    (target: EagleManualFolderItem) => {
      updateFolders((folders) => {
        const found = folders.some(
          (folder) => folder.folderId === target.folderId,
        )
        return found
          ? folders.map((folder) =>
              folder.folderId === target.folderId
                ? {
                    ...folder,
                    folderPath: target.folderPath,
                    count: folder.count + 1,
                  }
                : folder,
            )
          : [...folders, { ...target, count: 1 }]
      })
    },
    [updateFolders],
  )

  const sortedManualFolders = useMemo(
    () => [...manualFolders].sort((a, b) => b.count - a.count),
    [manualFolders],
  )

  return {
    manualFolders,
    sortedManualFolders,
    handleManualFolderSelect,
    handleRemoveManualFolder,
    recordManualFolderUsage,
  }
}
