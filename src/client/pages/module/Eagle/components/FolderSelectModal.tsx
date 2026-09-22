import {
  EAGLE_UNCLASSIFIED_FOLDER_ID,
  type EagleFolder,
} from '@/shared/eagle/types'
import { FolderOpenOutlined, FolderOutlined } from '@ant-design/icons'
import type { TreeDataNode } from 'antd'
import { Modal, Tree } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useEagleStore } from '../store'

export interface SelectedFolderInfo {
  id: string
  name: string
  path: string
}

interface FolderSelectModalProps {
  open: boolean
  onClose: () => void
  onConfirm: (folder: SelectedFolderInfo) => void | Promise<void>
  initialFolderId?: string
  title?: string
}

const collectFolderKeys = (folders: EagleFolder[]): string[] =>
  folders.flatMap((folder) => [
    folder.id,
    ...collectFolderKeys(folder.children),
  ])

const buildFolderMap = (
  folders: EagleFolder[],
  parentPath = '',
  map = new Map<string, SelectedFolderInfo>(),
): Map<string, SelectedFolderInfo> => {
  for (const folder of folders) {
    const currentPath = parentPath
      ? `${parentPath}/${folder.name}`
      : folder.name
    map.set(folder.id, {
      id: folder.id,
      name: folder.name,
      path: currentPath,
    })
    buildFolderMap(folder.children, currentPath, map)
  }
  return map
}

const toSelectTreeData = (folders: EagleFolder[]): TreeDataNode[] =>
  folders.map((folder) => ({
    key: folder.id,
    title: folder.name,
    children: toSelectTreeData(folder.children),
  }))

export function FolderSelectModal({
  open,
  onClose,
  onConfirm,
  initialFolderId,
  title = '选择文件夹',
}: FolderSelectModalProps) {
  const folders = useEagleStore((s) => s.folders)
  const [selectedKey, setSelectedKey] = useState<string>(
    initialFolderId ?? EAGLE_UNCLASSIFIED_FOLDER_ID,
  )
  const [expandedKeys, setExpandedKeys] = useState<string[]>([])
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const prevOpenRef = useRef(false)

  const folderMap = useMemo(() => {
    const map = buildFolderMap(folders)
    map.set(EAGLE_UNCLASSIFIED_FOLDER_ID, {
      id: EAGLE_UNCLASSIFIED_FOLDER_ID,
      name: '未分类',
      path: '未分类',
    })
    return map
  }, [folders])

  const treeData = useMemo<TreeDataNode[]>(
    () => [
      {
        key: EAGLE_UNCLASSIFIED_FOLDER_ID,
        title: '未分类',
        children: undefined,
      },
      ...toSelectTreeData(folders),
    ],
    [folders],
  )

  const scrollToSelected = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const selected = container.querySelector<HTMLElement>(
      '.ant-tree-node-selected, .ant-tree-treenode-selected',
    )
    if (!selected) return
    const containerRect = container.getBoundingClientRect()
    const selectedRect = selected.getBoundingClientRect()
    container.scrollTo({
      top:
        container.scrollTop +
        selectedRect.top -
        containerRect.top -
        (container.clientHeight - selectedRect.height) / 2,
    })
  }, [])

  useEffect(() => {
    if (open) {
      if (!prevOpenRef.current) {
        const targetKey =
          initialFolderId && folderMap.has(initialFolderId)
            ? initialFolderId
            : EAGLE_UNCLASSIFIED_FOLDER_ID
        setSelectedKey(targetKey)
        setExpandedKeys(collectFolderKeys(folders))

        const timer1 = setTimeout(scrollToSelected, 50)
        const timer2 = setTimeout(scrollToSelected, 200)
        return () => {
          clearTimeout(timer1)
          clearTimeout(timer2)
        }
      }
    }
    prevOpenRef.current = open
  }, [open, initialFolderId, folders, folderMap, scrollToSelected])

  const handleOk = () => {
    const info = folderMap.get(selectedKey)
    if (!info) return
    onClose()
    void onConfirm(info)
  }

  return (
    <Modal
      open={open}
      title={title}
      onCancel={onClose}
      onOk={handleOk}
      okButtonProps={{ disabled: !selectedKey }}
      afterOpenChange={(visible) => {
        if (visible) scrollToSelected()
      }}
      destroyOnClose
      centered
      width={460}
    >
      <div
        ref={scrollContainerRef}
        className="my-3 max-h-[55vh] min-h-[180px] overflow-y-auto rounded border border-slate-200 p-2 dark:border-slate-700"
      >
        <Tree
          treeData={treeData}
          expandedKeys={expandedKeys}
          onExpand={(keys) => setExpandedKeys(keys.map(String))}
          selectedKeys={selectedKey ? [selectedKey] : []}
          onSelect={(keys) => {
            if (keys[0]) {
              setSelectedKey(String(keys[0]))
            }
          }}
          showIcon
          icon={({ expanded }) =>
            expanded ? <FolderOpenOutlined /> : <FolderOutlined />
          }
          blockNode
        />
      </div>
    </Modal>
  )
}
