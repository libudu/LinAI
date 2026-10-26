interface FolderNode {
  id: string
  children?: readonly FolderNode[]
}

/** 新规则自底向上汇总父目录；兼容旧规则中仅保存父目录的继承授权。 */
export const resolveSharedFolderIds = (
  folders: readonly FolderNode[],
  grantedIds: readonly string[],
  selectionVersion: 1 | 2 = 2,
): Set<string> => {
  const grants = new Set(grantedIds)
  const visible = new Set<string>()
  const visit = (folder: FolderNode, inherited: boolean): boolean => {
    const children = folder.children ?? []
    const legacyShared = inherited || grants.has(folder.id)
    // 不使用 every(visit)，避免遇到未选子目录时短路，漏算后续兄弟目录。
    const childrenShared = children.map((child) => visit(child, legacyShared))
    const shared =
      children.length > 0
        ? childrenShared.every(Boolean)
        : selectionVersion === 1
          ? legacyShared
          : grants.has(folder.id)
    if (shared) visible.add(folder.id)
    return shared
  }
  for (const folder of folders) visit(folder, false)
  return visible
}
