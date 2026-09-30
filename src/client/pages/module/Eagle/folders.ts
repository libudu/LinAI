import type { EagleFolder } from '@/shared/eagle/types'

/** 文件夹选择的业务数据，独立于弹窗组件。 */
export interface SelectedFolderInfo {
  id: string
  name: string
  path: string
}

export const findFolder = (
  folders: EagleFolder[],
  folderId: string,
): EagleFolder | null => {
  for (const folder of folders) {
    if (folder.id === folderId) return folder
    const found = findFolder(folder.children, folderId)
    if (found) return found
  }
  return null
}

export const collectFolderKeys = (folders: EagleFolder[]): string[] =>
  folders.flatMap((folder) => [
    folder.id,
    ...collectFolderKeys(folder.children),
  ])

/** 按目录树顺序生成完整路径，供选择弹窗和分类排序复用。 */
export const buildFolderMap = (
  folders: EagleFolder[],
): Map<string, SelectedFolderInfo> => {
  const map = new Map<string, SelectedFolderInfo>()
  const walk = (nodes: EagleFolder[], parentPath: string) => {
    for (const folder of nodes) {
      const path = parentPath ? `${parentPath}/${folder.name}` : folder.name
      map.set(folder.id, { id: folder.id, name: folder.name, path })
      walk(folder.children, path)
    }
  }
  walk(folders, '')
  return map
}

export const buildFolderOrderMap = (folders: EagleFolder[]) =>
  new Map(
    [...buildFolderMap(folders).values()].map((folder, index) => [
      folder.path,
      index,
    ]),
  )
