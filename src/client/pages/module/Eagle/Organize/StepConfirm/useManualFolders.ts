import { settingsClient } from '@/client/service/settings'
import type {
  EagleManualFolderItem,
  EagleManualFoldersSettings,
} from '@/server/module/eagle/settings'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SelectedFolderInfo } from '../../components/FolderSelectModal'

const manualFoldersClient = settingsClient<EagleManualFoldersSettings>(
  'eagle-manual-folders',
)

export function useManualFolders({
  selectedId,
  setSelectedOptionKeys,
}: {
  selectedId: string | null
  setSelectedOptionKeys: React.Dispatch<
    React.SetStateAction<Record<string, string>>
  >
}) {
  const [manualFolders, setManualFolders] = useState<EagleManualFolderItem[]>(
    [],
  )
  const manualRevisionRef = useRef<number | undefined>(undefined)

  // 加载手动选择文件夹的历史记录
  useEffect(() => {
    let cancelled = false
    manualFoldersClient
      .get()
      .then((res) => {
        if (cancelled) return
        manualRevisionRef.current = res.revision
        setManualFolders(res.value.folders ?? [])
      })
      .catch((error) => {
        console.error('加载手动文件夹历史失败', error)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const saveManualFolders = useCallback(
    async (folders: EagleManualFolderItem[]) => {
      try {
        const res = await manualFoldersClient.put(
          { folders },
          manualRevisionRef.current,
        )
        manualRevisionRef.current = res.revision
        setManualFolders(res.value.folders ?? [])
      } catch (error) {
        console.error('保存手动文件夹历史失败', error)
      }
    },
    [],
  )

  const handleManualFolderSelect = useCallback(
    (folder: SelectedFolderInfo) => {
      const existing = manualFolders.find((f) => f.folderId === folder.id)
      if (!existing) {
        const next = [
          ...manualFolders,
          { folderId: folder.id, folderPath: folder.path, count: 0 },
        ]
        setManualFolders(next)
        void saveManualFolders(next)
      }
      if (selectedId) {
        setSelectedOptionKeys((current) => ({
          ...current,
          [selectedId]: `manual:${folder.id}`,
        }))
      }
    },
    [manualFolders, saveManualFolders, selectedId, setSelectedOptionKeys],
  )

  const handleRemoveManualFolder = useCallback(
    (target: EagleManualFolderItem) => {
      const next = manualFolders.filter((f) => f.folderId !== target.folderId)
      setManualFolders(next)
      void saveManualFolders(next)
      if (selectedId) {
        setSelectedOptionKeys((current) => {
          if (current[selectedId] === `manual:${target.folderId}`) {
            const copy = { ...current }
            delete copy[selectedId]
            return copy
          }
          return current
        })
      }
    },
    [manualFolders, saveManualFolders, selectedId, setSelectedOptionKeys],
  )

  const recordManualFolderUsage = useCallback(
    (folderId: string) => {
      const nextManuals = manualFolders.map((f) =>
        f.folderId === folderId ? { ...f, count: f.count + 1 } : f,
      )
      setManualFolders(nextManuals)
      void saveManualFolders(nextManuals)
    },
    [manualFolders, saveManualFolders],
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
