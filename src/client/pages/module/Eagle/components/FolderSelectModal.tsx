import {
  EAGLE_UNCLASSIFIED_FOLDER_ID,
  type EagleFolder,
} from '@/shared/eagle/types'
import type { TreeDataNode } from 'antd'
import { useMemo } from 'react'
import { buildFolderMap, type SelectedFolderInfo } from '../folders'
import { useEagleStore } from '../store'
import { FolderTreeSelectModal } from './FolderTreeSelectModal'

interface FolderSelectModalProps {
  open: boolean
  onClose: () => void
  onConfirm: (folder: SelectedFolderInfo) => void | Promise<void>
  initialFolderId?: string
  title?: string
  /** 整理来源选择可包含「全部」，归档目标选择默认不包含 */
  includeAll?: boolean
}

const toSelectTreeData = (folders: EagleFolder[]): TreeDataNode[] =>
  folders.map((folder) => ({
    key: folder.id,
    title: folder.name,
    children: toSelectTreeData(folder.children),
  }))

export function FolderSelectModal({
  open,
  onClose,
  onConfirm,
  initialFolderId,
  title = '选择文件夹',
  includeAll = false,
}: FolderSelectModalProps) {
  const folders = useEagleStore((s) => s.folders)
  const folderMap = useMemo(() => {
    const map = buildFolderMap(folders)
    if (includeAll) {
      map.set('__all__', { id: '__all__', name: '全部', path: '全部' })
    }
    map.set(EAGLE_UNCLASSIFIED_FOLDER_ID, {
      id: EAGLE_UNCLASSIFIED_FOLDER_ID,
      name: '未分类',
      path: '未分类',
    })
    return map
  }, [folders, includeAll])

  const treeData = useMemo<TreeDataNode[]>(
    () => [
      ...(includeAll ? [{ key: '__all__', title: '全部' }] : []),
      { key: EAGLE_UNCLASSIFIED_FOLDER_ID, title: '未分类' },
      ...toSelectTreeData(folders),
    ],
    [folders, includeAll],
  )
  const initialKey =
    initialFolderId && folderMap.has(initialFolderId)
      ? initialFolderId
      : includeAll && !initialFolderId
        ? '__all__'
        : EAGLE_UNCLASSIFIED_FOLDER_ID

  return (
    <FolderTreeSelectModal
      open={open}
      title={title}
      treeData={treeData}
      initialKey={initialKey}
      onClose={onClose}
      onConfirm={(key) => {
        const info = folderMap.get(key)
        if (info) void onConfirm(info)
      }}
    />
  )
}
