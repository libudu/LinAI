import { resolveSharedFolderIds } from '@/shared/eagle/sharing'
import type { EagleIndexState, EagleItemIndex, EagleRawFolder } from './types'

/** 仅由已验证的服务端共享会话构造，不接受请求参数传入权限。 */
export interface EagleLibraryAccess {
  libraryPath: string
  grantedFolderIds: string[]
  selectionVersion: 1 | 2
}

/** 保留共享目录的祖先作为导航，只暴露其 ID、名称和筛选后的子目录。 */
const filterFolders = (
  folders: EagleRawFolder[],
  shared: ReadonlySet<string>,
): EagleRawFolder[] =>
  folders.flatMap((folder) => {
    const children = filterFolders(folder.children ?? [], shared)
    if (shared.has(folder.id)) return [{ ...folder, children }]
    return children.length > 0
      ? [{ id: folder.id, name: folder.name, children }]
      : []
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
  const shared = resolveSharedFolderIds(
    index.libraryPath === access.libraryPath ? index.folders : [],
    access.grantedFolderIds,
    access.selectionVersion,
  )
  const items = new Map<string, EagleItemIndex>()
  for (const [id, item] of index.items) {
    if (item.isDeleted) continue
    // 导航祖先不属于共享授权，不能据此开放其直属文件或保留未授权归属。
    const folders = item.folders.filter((folderId) => shared.has(folderId))
    if (folders.length > 0) items.set(id, { ...item, folders })
  }
  return {
    libraryPath: index.libraryPath,
    folders: filterFolders(index.folders, shared),
    items,
  }
}
