import type { EagleMediaType } from '@/shared/eagle/types'
import { createContext, useContext } from 'react'
import { eagleFileUrl, eagleVideoContactSheetUrl } from '../api'

/** 三步共享任务媒体类型，避免组件各自读取资源树而误显示另一类型的任务。 */
export const OrganizeMediaContext = createContext<EagleMediaType>('image')

export const useOrganizeMedia = () => {
  const mediaType = useContext(OrganizeMediaContext)
  return {
    mediaType,
    mediaLabel: mediaType === 'video' ? '视频' : '图片',
    unit: mediaType === 'video' ? '个' : '张',
    previewUrl:
      mediaType === 'video' ? eagleVideoContactSheetUrl : eagleFileUrl,
  }
}
