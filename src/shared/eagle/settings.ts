/** Eagle 设置的共享契约，无服务端注册、Node 或 zod 依赖。 */
import type { VisionEndpointSettings } from '../vision/endpoints'

export interface EagleSettings {
  libraryPath: string | null
}

export interface EagleFolderTreeSettings {
  expandedFolderIds: string[] | null
}

export interface EagleManualFolderItem {
  folderId: string
  folderPath: string
  count: number
}

export interface EagleManualFoldersSettings {
  folders: EagleManualFolderItem[]
}

export type EagleVisionSettings = VisionEndpointSettings
