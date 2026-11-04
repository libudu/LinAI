import { usePendingImages } from '@/client/features/image-assets'
import { message } from 'antd'
import { addEagleItemToGallery } from './api'

/** 浏览与整理共用：将 Eagle 原图复制到图库并加入待使用。 */
export async function addEagleImageToPending(itemId: string): Promise<void> {
  try {
    const url = await addEagleItemToGallery(itemId)
    await usePendingImages.getState().add(url)
    message.success('已添加到图库待使用')
  } catch (error) {
    message.error(error instanceof Error ? error.message : '添加失败')
  }
}
