import {
  EAGLE_TRASH_FOLDER_ID,
  EAGLE_UNCLASSIFIED_FOLDER_ID,
  type EagleFolder,
} from '@/shared/eagle/types'
import {
  DeleteOutlined,
  FolderOpenOutlined,
  FolderOutlined,
} from '@ant-design/icons'
import type { TreeDataNode } from 'antd'
import { Tree } from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'
import { requestEagleLibraryRefresh, useEagleStore } from '../store'
import { EditFolderModal } from './EditFolderModal'
import { FolderContextMenu } from './FolderContextMenu'
import './FolderTree.scss'
import { useFolderExpansion } from './useFolderExpansion'

// 节点标题：名称 + 灰色图片数（含子孙累计），开启展示时在名称下方加一行浅灰描述（单行超长省略）
const renderTitle = (
  name: string,
  count: number,
  description?: string,
  showDescription?: boolean,
) => (
  <span className="flex min-w-0 flex-col items-start">
    <span className="inline-flex items-baseline gap-1">
      {name}
      <span className="text-sm text-slate-400">({count})</span>
    </span>
    {showDescription && description ? (
      <span
        className="relative -top-1 line-clamp-1 w-full text-xs leading-none text-slate-400"
        title={description}
      >
        {description}
      </span>
    ) : null}
  </span>
)

const toTreeData = (
  folders: EagleFolder[],
  onEdit: (folder: EagleFolder) => void,
  showDescription: boolean,
): TreeDataNode[] =>
  folders.map((folder) => ({
    key: folder.id,
    title: (
      <FolderContextMenu folder={folder} onEdit={onEdit}>
        {renderTitle(
          folder.name,
          folder.totalCount,
          folder.description,
          showDescription,
        )}
      </FolderContextMenu>
    ),
    children: toTreeData(folder.children, onEdit, showDescription),
  }))

const findAncestorKeys = (
  folders: EagleFolder[],
  folderId: string,
  ancestors: string[] = [],
): string[] | null => {
  for (const folder of folders) {
    if (folder.id === folderId) return ancestors
    const found = findAncestorKeys(folder.children, folderId, [
      ...ancestors,
      folder.id,
    ])
    if (found) return found
  }
  return null
}

// 左侧文件夹目录树：贴边拉满，展开状态持久化到后端设置（data/eagle/folder-tree.json），
// 节点带文件夹图标与图片数
// 开启「显示文件夹描述」后节点名称下方展示浅灰描述（单行省略）
// 右键节点弹出菜单（编辑名称/描述，写回 Eagle 库 metadata.json）
export function FolderTree({ onSelected }: { onSelected?: () => void }) {
  const {
    folders,
    foldersLoading,
    currentFolderId,
    selectFolder,
    allTotal,
    unclassifiedTotal,
    trashTotal,
    showFolderDescription,
  } = useEagleStore()
  const { expandedKeys, expandedStateLoaded, handleExpand, revealAncestors } =
    useFolderExpansion(folders)
  const [editingFolder, setEditingFolder] = useState<EagleFolder | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const initialSelectionRevealedRef = useRef(false)
  const treeData = useMemo<TreeDataNode[]>(
    () => [
      { key: '', title: renderTitle('全部', allTotal), children: undefined },
      {
        key: EAGLE_UNCLASSIFIED_FOLDER_ID,
        title: renderTitle('未分类', unclassifiedTotal),
        children: undefined,
      },
      {
        key: EAGLE_TRASH_FOLDER_ID,
        title: renderTitle('回收站', trashTotal),
        children: undefined,
      },
      ...toTreeData(folders, setEditingFolder, showFolderDescription),
    ],
    [folders, allTotal, showFolderDescription, unclassifiedTotal, trashTotal],
  )

  // 文件夹与展开状态就绪后，确保历史选中项可见并滚动到其位置
  useEffect(() => {
    if (
      initialSelectionRevealedRef.current ||
      foldersLoading ||
      !expandedStateLoaded ||
      !currentFolderId
    )
      return

    const ancestorKeys = findAncestorKeys(folders, currentFolderId)
    if (!ancestorKeys) return
    initialSelectionRevealedRef.current = true
    revealAncestors(ancestorKeys)

    requestAnimationFrame(() => {
      const container = scrollContainerRef.current
      const selected = container?.querySelector<HTMLElement>(
        '.ant-tree-node-selected',
      )
      if (!container || !selected) return
      const containerRect = container.getBoundingClientRect()
      const selectedRect = selected.getBoundingClientRect()
      container.scrollTo({
        top:
          container.scrollTop +
          selectedRect.top -
          containerRect.top -
          (container.clientHeight - selectedRect.height) / 2,
      })
    })
  }, [
    currentFolderId,
    expandedStateLoaded,
    folders,
    foldersLoading,
    revealAncestors,
  ])

  return (
    <div className="flex h-full flex-col">
      <div
        ref={scrollContainerRef}
        className="eagle-folder-tree min-h-0 flex-1 overflow-y-auto py-1"
      >
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
          icon={(nodeProps) => {
            const isTrash =
              (nodeProps as { data?: { key?: string } })?.data?.key ===
                EAGLE_TRASH_FOLDER_ID ||
              (nodeProps as { eventKey?: string })?.eventKey ===
                EAGLE_TRASH_FOLDER_ID
            if (isTrash) return <DeleteOutlined />
            return nodeProps.expanded ? (
              <FolderOpenOutlined />
            ) : (
              <FolderOutlined />
            )
          }}
          blockNode
        />
        {foldersLoading && (
          <div className="pt-2 text-center text-xs text-slate-400">加载中…</div>
        )}
      </div>

      <EditFolderModal
        folder={editingFolder}
        onClose={() => setEditingFolder(null)}
        onSaved={() => {
          void requestEagleLibraryRefresh().catch((error) =>
            console.error('刷新 Eagle 文件夹失败', error),
          )
        }}
      />
    </div>
  )
}
