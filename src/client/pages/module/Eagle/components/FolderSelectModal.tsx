import {
  EAGLE_UNCLASSIFIED_FOLDER_ID,
  type EagleFolder,
} from '@/shared/eagle/types'
import {
  FolderOpenOutlined,
  FolderOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import type { TreeDataNode } from 'antd'
import { Empty, Input, Modal, Tree } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  buildFolderMap,
  collectFolderKeys,
  type SelectedFolderInfo,
} from '../folders'
import { useEagleStore } from '../store'

interface FolderSelectModalProps {
  open: boolean
  onClose: () => void
  onConfirm: (folder: SelectedFolderInfo) => void | Promise<void>
  initialFolderId?: string
  title?: string
  /** 整理来源选择可包含「全部」，归档目标选择默认不包含 */
  includeAll?: boolean
}

const toSelectTreeData = (folders: EagleFolder[]): TreeDataNode[] =>
  folders.map((folder) => ({
    key: folder.id,
    title: folder.name,
    children: toSelectTreeData(folder.children),
  }))

// 保留匹配文件夹及其父目录，便于区分不同路径下的同名文件夹。
const filterTreeData = (
  nodes: TreeDataNode[],
  keyword: string,
): TreeDataNode[] =>
  nodes.flatMap((node) => {
    const children = filterTreeData(node.children ?? [], keyword)
    return String(node.title).toLowerCase().includes(keyword) || children.length
      ? [{ ...node, children }]
      : []
  })

const collectTreeKeys = (nodes: TreeDataNode[]): string[] =>
  nodes.flatMap((node) => [
    String(node.key),
    ...collectTreeKeys(node.children ?? []),
  ])

export function FolderSelectModal({
  open,
  onClose,
  onConfirm,
  initialFolderId,
  title = '选择文件夹',
  includeAll = false,
}: FolderSelectModalProps) {
  const folders = useEagleStore((s) => s.folders)
  const [selectedKey, setSelectedKey] = useState<string>(
    initialFolderId ?? EAGLE_UNCLASSIFIED_FOLDER_ID,
  )
  const [expandedKeys, setExpandedKeys] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const keyword = search.trim().toLowerCase()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const prevOpenRef = useRef(false)

  const folderMap = useMemo(() => {
    const map = buildFolderMap(folders)
    if (includeAll) {
      map.set('__all__', { id: '__all__', name: '全部', path: '全部' })
    }
    map.set(EAGLE_UNCLASSIFIED_FOLDER_ID, {
      id: EAGLE_UNCLASSIFIED_FOLDER_ID,
      name: '未分类',
      path: '未分类',
    })
    return map
  }, [folders, includeAll])

  const treeData = useMemo<TreeDataNode[]>(
    () => [
      ...(includeAll ? [{ key: '__all__', title: '全部' }] : []),
      {
        key: EAGLE_UNCLASSIFIED_FOLDER_ID,
        title: '未分类',
        children: undefined,
      },
      ...toSelectTreeData(folders),
    ],
    [folders, includeAll],
  )
  const filteredTreeData = useMemo(
    () => (keyword ? filterTreeData(treeData, keyword) : treeData),
    [treeData, keyword],
  )
  const visibleKeys = useMemo(
    () => collectTreeKeys(filteredTreeData),
    [filteredTreeData],
  )
  const canConfirm = visibleKeys.includes(selectedKey)

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
    const justOpened = open && !prevOpenRef.current
    prevOpenRef.current = open
    if (open) {
      if (justOpened) {
        const targetKey =
          initialFolderId && folderMap.has(initialFolderId)
            ? initialFolderId
            : includeAll && !initialFolderId
              ? '__all__'
              : EAGLE_UNCLASSIFIED_FOLDER_ID
        setSelectedKey(targetKey)
        setSearch('')
        setExpandedKeys(collectFolderKeys(folders))

        const timer1 = setTimeout(scrollToSelected, 50)
        const timer2 = setTimeout(scrollToSelected, 200)
        return () => {
          clearTimeout(timer1)
          clearTimeout(timer2)
        }
      }
    }
  }, [open, initialFolderId, folders, folderMap, scrollToSelected, includeAll])

  const handleOk = () => {
    if (!canConfirm) return
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
      okButtonProps={{ disabled: !canConfirm }}
      afterOpenChange={(visible) => {
        if (visible) scrollToSelected()
      }}
      destroyOnClose
      centered
      width={460}
    >
      <Input
        className="mt-3"
        prefix={<SearchOutlined />}
        allowClear
        value={search}
        placeholder="搜索文件夹名称"
        aria-label="搜索文件夹名称"
        onChange={(event) => setSearch(event.target.value)}
      />
      <div
        ref={scrollContainerRef}
        className="my-3 max-h-[55vh] min-h-[180px] overflow-y-auto rounded border border-slate-200 p-2 dark:border-slate-700"
      >
        {filteredTreeData.length === 0 ? (
          <Empty description="没有匹配的文件夹" />
        ) : (
          <Tree
            treeData={filteredTreeData}
            expandedKeys={keyword ? visibleKeys : expandedKeys}
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
        )}
      </div>
    </Modal>
  )
}
