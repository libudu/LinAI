import { resolveSharedFolderIds } from '@/shared/eagle/sharing'
import type { EagleIndexState, EagleItemIndex, EagleRawFolder } from './types'

/** 仅由已验证的服务端共享会话构造，不接受请求参数传入权限。 */
export interface EagleLibraryAccess {
  libraryPath: string
  grantedFolderIds: string[]
  selectionVersion: 1 | 2
}

/** 隐藏未授权祖先，仅开放的子目录提升到最近可见层级。 */
const filterFolders = (
  folders: EagleRawFolder[],
  visible: ReadonlySet<string>,
): EagleRawFolder[] =>
  folders.flatMap((folder) => {
    const children = filterFolders(folder.children ?? [], visible)
    return visible.has(folder.id) ? [{ ...folder, children }] : children
  })

export const sharedAccessKey = (access?: EagleLibraryAccess) =>
  access
    ? JSON.stringify([
        access.libraryPath,
        access.grantedFolderIds,
        access.selectionVersion,
      ])
    : ''

/** 查询缓存按权限隔离，过滤发生在计数、排序和分页之前。 */
export const projectSharedIndex = (
  index: EagleIndexState,
  access: EagleLibraryAccess,
): EagleIndexState => {
  const visible = resolveSharedFolderIds(
    index.libraryPath === access.libraryPath ? index.folders : [],
    access.grantedFolderIds,
    access.selectionVersion,
  )
  const items = new Map<string, EagleItemIndex>()
  for (const [id, item] of index.items) {
    if (item.isDeleted) continue
    const folders = item.folders.filter((folderId) => visible.has(folderId))
    if (folders.length > 0) items.set(id, { ...item, folders })
  }
  return {
    libraryPath: index.libraryPath,
    folders: filterFolders(index.folders, visible),
    items,
  }
}
