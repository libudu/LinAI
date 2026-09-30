import { usePendingImages } from '@/client/pages/common/GenImage/TemplateSection/TemplateForm/Gallery/pendingImages'
import {
  EAGLE_TRASH_FOLDER_ID,
  EAGLE_UNCLASSIFIED_FOLDER_ID,
  type EagleItem,
} from '@/shared/eagle/types'
import { Modal, message } from 'antd'
import { useState } from 'react'
import { addEagleItemToGallery, purgeEagleItem, updateEagleItem } from '../api'
import { confirmDeleteEagleItem } from '../components/confirmDeleteModal'
import type { SelectedFolderInfo } from '../folders'
import { requestEagleLibraryRefresh } from '../store'

/** 获取修改文件夹弹窗的初始选中文件夹 ID */
const getInitialFolderId = (
  item: EagleItem | null,
  currentFolderId: string,
): string => {
  if (!item) return EAGLE_UNCLASSIFIED_FOLDER_ID
  if (item.folders && item.folders.length > 0) {
    if (
      currentFolderId &&
      currentFolderId !== EAGLE_UNCLASSIFIED_FOLDER_ID &&
      currentFolderId !== EAGLE_TRASH_FOLDER_ID &&
      item.folders.includes(currentFolderId)
    ) {
      return currentFolderId
    }
    return item.folders[0]
  }
  return EAGLE_UNCLASSIFIED_FOLDER_ID
}

/** 网格条目操作与弹窗状态；卡片和网格不直接协调写操作。 */
export function useResourceActions(currentFolderId: string) {
  const addPendingImage = usePendingImages((s) => s.add)
  const [movingItem, setMovingItem] = useState<EagleItem | null>(null)
  const handleMoveFolder = async (folder: SelectedFolderInfo) => {
    const item = movingItem
    setMovingItem(null)
    if (!item) return
    const folderIds =
      folder.id === EAGLE_UNCLASSIFIED_FOLDER_ID ? [] : [folder.id]
    try {
      await updateEagleItem(item.id, { folderIds })
      message.success(`已移至「${folder.name}」`)
      await requestEagleLibraryRefresh()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '修改文件夹失败')
    }
  }

  const handleDeleteItem = (item: EagleItem) => {
    confirmDeleteEagleItem({
      id: item.id,
      name: item.name,
      onDeleted: () => requestEagleLibraryRefresh(),
    })
  }

  const handleAddToGallery = async (item: EagleItem) => {
    try {
      const url = await addEagleItemToGallery(item.id)
      await addPendingImage(url)
      message.success('已添加到图库待使用')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '添加失败')
    }
  }

  const handlePurgeItem = (item: EagleItem) => {
    Modal.confirm({
      title: '彻底删除',
      content: `确定要彻底删除「${item.name}」吗？此操作将从磁盘永久删除原文件且无法撤销。`,
      okText: '彻底删除',
      okType: 'danger',
      cancelText: '取消',
      centered: true,
      onOk: async () => {
        try {
          await purgeEagleItem(item.id)
          message.success('已彻底删除')
          await requestEagleLibraryRefresh()
        } catch (error) {
          message.error(error instanceof Error ? error.message : '删除失败')
          throw error
        }
      },
    })
  }

  return {
    movingItem,
    setMovingItem,
    initialFolderId: getInitialFolderId(movingItem, currentFolderId),
    handleMoveFolder,
    handleDeleteItem,
    handleAddToGallery,
    handlePurgeItem,
  }
}
