import type { EagleFolder } from '@/shared/eagle/types'
import { FolderOpenOutlined, FolderOutlined } from '@ant-design/icons'
import type { TreeDataNode } from 'antd'
import { Tree } from 'antd'
import { useMemo, useState } from 'react'
import { useEagleStore } from '../store'
import { EditFolderModal } from './EditFolderModal'
import { FolderContextMenu } from './FolderContextMenu'
import './FolderTree.scss'

const EXPANDED_STORAGE_KEY = 'eagle_folder_expanded'

// 节点标题：名称 + 灰色图片数（含子孙累计）
const renderTitle = (name: string, count: number) => (
  <span className="inline-flex items-baseline gap-1">
    {name}
    <span className="text-sm text-slate-400">({count})</span>
  </span>
)

const toTreeData = (
  folders: EagleFolder[],
  onEdit: (folder: EagleFolder) => void,
): TreeDataNode[] =>
  folders.map((folder) => ({
    key: folder.id,
    title: (
      <FolderContextMenu folder={folder} onEdit={onEdit}>
        {renderTitle(folder.name, folder.totalCount)}
      </FolderContextMenu>
    ),
    children: toTreeData(folder.children, onEdit),
  }))

// 收集全部文件夹 key（首次无本地记录时默认全展开）
const collectKeys = (folders: EagleFolder[]): string[] =>
  folders.flatMap((folder) => [folder.id, ...collectKeys(folder.children)])

// 读取本地记录的展开状态，无记录返回 null（表示走默认全展开）
const loadExpandedKeys = (): string[] | null => {
  try {
    const raw = localStorage.getItem(EXPANDED_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed))
        return parsed.filter((k) => typeof k === 'string')
    }
  } catch {
    // 忽略损坏的本地缓存
  }
  return null
}

// 左侧文件夹目录树：贴边拉满，展开状态持久化到 localStorage，节点带文件夹图标与图片数
// 右键节点弹出菜单（编辑名称/描述，写回 Eagle 库 metadata.json）
export function FolderTree({ onSelected }: { onSelected?: () => void }) {
  const {
    folders,
    foldersLoading,
    currentFolderId,
    selectFolder,
    allTotal,
    refreshFolders,
  } = useEagleStore()
  // null = 尚无本地记录，回退为全展开
  const [storedKeys, setStoredKeys] = useState<string[] | null>(
    loadExpandedKeys,
  )
  const [editingFolder, setEditingFolder] = useState<EagleFolder | null>(null)

  const treeData = useMemo<TreeDataNode[]>(
    () => [
      { key: '', title: renderTitle('全部', allTotal), children: undefined },
      ...toTreeData(folders, setEditingFolder),
    ],
    [folders, allTotal],
  )

  const allKeys = useMemo(() => collectKeys(folders), [folders])
  const expandedKeys = storedKeys ?? allKeys

  const handleExpand = (keys: React.Key[]) => {
    const next = keys.map(String)
    setStoredKeys(next)
    localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify(next))
  }

  return (
    <div className="eagle-folder-tree h-full overflow-y-auto py-1">
      <Tree
        treeData={treeData}
        expandedKeys={expandedKeys}
        onExpand={handleExpand}
        selectedKeys={[currentFolderId]}
        onSelect={(keys) => {
          selectFolder((keys[0] as string) ?? '')
          onSelected?.()
        }}
        showIcon
        icon={({ expanded }) =>
          expanded ? <FolderOpenOutlined /> : <FolderOutlined />
        }
        blockNode
      />
      {foldersLoading && (
        <div className="pt-2 text-center text-xs text-slate-400">加载中…</div>
      )}

      <EditFolderModal
        folder={editingFolder}
        onClose={() => setEditingFolder(null)}
        onSaved={refreshFolders}
      />
    </div>
  )
}
