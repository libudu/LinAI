/** 前端拥有的便携偏好与手动分类历史。 */
export interface EagleFolderTreePreferences {
  /** null 表示首次进入，默认全部展开。 */
  expandedFolderIds: string[] | null
}

export interface EagleManualFolderItem {
  folderId: string
  folderPath: string
  count: number
}

export interface EagleManualFoldersPreferences {
  folders: EagleManualFolderItem[]
}
