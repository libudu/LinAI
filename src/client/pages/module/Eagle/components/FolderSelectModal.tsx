import {
  EAGLE_UNCLASSIFIED_FOLDER_ID,
  type EagleFolder,
} from '@/shared/eagle/types'
import { FolderOpenOutlined, FolderOutlined } from '@ant-design/icons'
import type { TreeDataNode } from 'antd'
import { Modal, Tree } from 'antd'
import { useEffect, useMemo, useState } from 'react'
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
  const [confirming, setConfirming] = useState(false)

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

  useEffect(() => {
    if (open) {
      setSelectedKey(initialFolderId ?? EAGLE_UNCLASSIFIED_FOLDER_ID)
      setExpandedKeys(collectFolderKeys(folders))
    }
  }, [open, initialFolderId, folders])

  const handleOk = async () => {
    const info = folderMap.get(selectedKey)
    if (!info) return
    setConfirming(true)
    try {
      await onConfirm(info)
      onClose()
    } finally {
      setConfirming(false)
    }
  }

  return (
    <Modal
      open={open}
      title={title}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={confirming}
      okButtonProps={{ disabled: !selectedKey }}
      destroyOnClose
      centered
      width={460}
    >
      <div className="my-3 max-h-[55vh] min-h-[180px] overflow-y-auto rounded border border-slate-200 p-2 dark:border-slate-700">
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
