import type { EagleFolder } from '@/shared/eagle/types'
import { Tree } from 'antd'
import type { TreeDataNode } from 'antd'
import { useMemo } from 'react'
import { useEagleStore } from './store'

// 左侧文件夹目录树：默认全展开，节点标题带图片数（含子孙累计）
const toTreeData = (folders: EagleFolder[]): TreeDataNode[] =>
  folders.map((folder) => ({
    key: folder.id,
    title: `${folder.name} (${folder.totalCount})`,
    children: toTreeData(folder.children),
  }))

export function FolderTree() {
  const { folders, foldersLoading, currentFolderId, selectFolder, allTotal } =
    useEagleStore()

  const treeData = useMemo<TreeDataNode[]>(
    () => [
      { key: '', title: `全部 (${allTotal})`, children: undefined },
      ...toTreeData(folders),
    ],
    [folders, allTotal],
  )

  return (
    <div className="h-full overflow-y-auto p-2">
      <Tree
        treeData={treeData}
        defaultExpandAll
        selectedKeys={[currentFolderId]}
        onSelect={(keys) => selectFolder((keys[0] as string) ?? '')}
        blockNode
      />
      {foldersLoading && (
        <div className="pt-2 text-center text-xs text-slate-400">加载中…</div>
      )}
    </div>
  )
}
