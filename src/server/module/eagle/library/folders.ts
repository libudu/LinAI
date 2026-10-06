import type { OrganizeFolderStandard } from '@/shared/eagle/organize'
import type { EagleFolder } from '@/shared/eagle/types'
import type { EagleRawFolder } from './types'

/** 递归构造展示树，统计直接包含数和子孙累计数量。 */
export const buildFolderTree = (
  raw: EagleRawFolder[],
  counts: Map<string, number>,
): EagleFolder[] =>
  raw.map((folder) => {
    const children = buildFolderTree(folder.children ?? [], counts)
    const count = counts.get(folder.id) ?? 0
    return {
      id: folder.id,
      name: folder.name,
      description: folder.description ?? '',
      children,
      count,
      totalCount:
        count + children.reduce((sum, child) => sum + child.totalCount, 0),
    }
  })

/** 返回原树节点，查询存在性与元数据编辑共用。 */
export const findRawFolder = (
  folders: EagleRawFolder[],
  id: string,
): EagleRawFolder | null => {
  for (const folder of folders) {
    if (folder.id === id) return folder
    const hit = findRawFolder(folder.children ?? [], id)
    if (hit) return hit
  }
  return null
}

const appendFolderPath = (parentPath: string, name: string) =>
  parentPath ? `${parentPath}/${name}` : name

/** 基于同一目录快照构造路径；默认子分类优先，展示排序可用父目录优先的树顺序。 */
export const collectFolderPaths = (
  folders: EagleRawFolder[],
  order: 'preorder' | 'postorder' = 'postorder',
) => {
  const entries: Array<{ folder: EagleRawFolder; folderPath: string }> = []
  const walk = (nodes: EagleRawFolder[], parentPath: string) => {
    for (const folder of nodes) {
      const folderPath = appendFolderPath(parentPath, folder.name)
      if (order === 'preorder') entries.push({ folder, folderPath })
      walk(folder.children ?? [], folderPath)
      if (order === 'postorder') entries.push({ folder, folderPath })
    }
  }
  walk(folders, '')
  return entries
}

/** 仅有描述的目录参与分类；指定父目录时只取其所有层级的子目录，保留完整路径与顺序。 */
export const buildFolderStandards = (
  folders: EagleRawFolder[],
  parentFolderId?: string,
): OrganizeFolderStandard[] => {
  const descendantIds = parentFolderId
    ? new Set(
        collectFolderPaths(
          findRawFolder(folders, parentFolderId)?.children ?? [],
        ).map(({ folder }) => folder.id),
      )
    : null
  return collectFolderPaths(folders).flatMap(({ folder, folderPath }) =>
    (!descendantIds || descendantIds.has(folder.id)) &&
    folder.description?.trim()
      ? [
          {
            folderId: folder.id,
            folderPath,
            name: folder.name,
            description: folder.description,
          },
        ]
      : [],
  )
}

/** 按完整路径查找目录，保持已有的遍历和匹配顺序。 */
export const findRawFolderIdByPath = (
  folders: EagleRawFolder[],
  folderPath: string,
): string | null => {
  let foundId: string | null = null
  const walk = (nodes: EagleRawFolder[], parentPath: string) => {
    for (const folder of nodes) {
      const currentPath = appendFolderPath(parentPath, folder.name)
      if (currentPath === folderPath) {
        foundId = folder.id
        return
      }
      walk(folder.children ?? [], currentPath)
    }
  }
  walk(folders, '')
  return foundId
}

/** 按传入 ID 的顺序解析路径，忽略不存在的目录。 */
export const resolveFolderPaths = (
  folders: EagleRawFolder[],
  folderIds: string[],
): string[] => {
  const paths = new Map(
    collectFolderPaths(folders).map(({ folder, folderPath }) => [
      folder.id,
      folderPath,
    ]),
  )
  return folderIds.flatMap((id) => {
    const folderPath = paths.get(id)
    return folderPath ? [folderPath] : []
  })
}
