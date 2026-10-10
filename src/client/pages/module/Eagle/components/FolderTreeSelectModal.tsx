import {
  FolderOpenOutlined,
  FolderOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import type { TreeDataNode } from 'antd'
import { Button, Empty, Input, Modal, Tree } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

interface FolderTreeSelectModalProps {
  open: boolean
  onClose: () => void
  onConfirm: (key: string) => void
  treeData: TreeDataNode[]
  initialKey?: string
  title?: string
  searchPlaceholder?: string
  emptyDescription?: string
  onClear?: () => void
  clearDisabled?: boolean
}

// 保留匹配节点及其父目录，便于区分不同路径下的同名文件夹。
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

const collectSelectableKeys = (nodes: TreeDataNode[]): string[] =>
  nodes.flatMap((node) => [
    ...(!node.disabled && node.selectable !== false ? [String(node.key)] : []),
    ...collectSelectableKeys(node.children ?? []),
  ])

/** 文件夹与待确认分堆共用搜索、层级展开和确认选择交互。 */
export function FolderTreeSelectModal({
  open,
  onClose,
  onConfirm,
  treeData,
  initialKey,
  title = '选择文件夹',
  searchPlaceholder = '搜索文件夹名称',
  emptyDescription = '没有匹配的文件夹',
  onClear,
  clearDisabled = false,
}: FolderTreeSelectModalProps) {
  const [selectedKey, setSelectedKey] = useState(initialKey)
  const [expandedKeys, setExpandedKeys] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const keyword = search.trim().toLowerCase()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const prevOpenRef = useRef(false)
  const filteredTreeData = useMemo(
    () => (keyword ? filterTreeData(treeData, keyword) : treeData),
    [treeData, keyword],
  )
  const visibleKeys = useMemo(
    () => collectTreeKeys(filteredTreeData),
    [filteredTreeData],
  )
  const selectableKeys = useMemo(
    () => collectSelectableKeys(filteredTreeData),
    [filteredTreeData],
  )
  const canConfirm = Boolean(
    selectedKey && selectableKeys.includes(selectedKey),
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
    const justOpened = open && !prevOpenRef.current
    prevOpenRef.current = open
    if (!justOpened) return
    setSelectedKey(
      initialKey && collectSelectableKeys(treeData).includes(initialKey)
        ? initialKey
        : undefined,
    )
    setSearch('')
    setExpandedKeys(collectTreeKeys(treeData))

    const timer1 = setTimeout(scrollToSelected, 50)
    const timer2 = setTimeout(scrollToSelected, 200)
    return () => {
      clearTimeout(timer1)
      clearTimeout(timer2)
    }
  }, [open, initialKey, treeData, scrollToSelected])

  return (
    <Modal
      open={open}
      title={title}
      className="eagle-folder-tree-select-modal"
      onCancel={onClose}
      onOk={() => {
        if (!canConfirm || !selectedKey) return
        onClose()
        onConfirm(selectedKey)
      }}
      okButtonProps={{ disabled: !canConfirm }}
      footer={(original, { OkBtn, CancelBtn }) =>
        onClear ? (
          <div className="flex items-center justify-between gap-2">
            <Button
              disabled={clearDisabled}
              onClick={() => {
                onClose()
                onClear()
              }}
            >
              取消置顶
            </Button>
            <div>
              <CancelBtn />
              <OkBtn />
            </div>
          </div>
        ) : (
          original
        )
      }
      afterOpenChange={(visible) => {
        if (visible) scrollToSelected()
      }}
      destroyOnHidden
      centered
      width={460}
    >
      <Input
        className="mt-3"
        prefix={<SearchOutlined />}
        allowClear
        value={search}
        placeholder={searchPlaceholder}
        aria-label={searchPlaceholder}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div
        ref={scrollContainerRef}
        className="my-3 max-h-[55vh] min-h-[180px] overflow-y-auto rounded border border-slate-200 p-2 dark:border-slate-700"
      >
        {filteredTreeData.length === 0 ? (
          <Empty description={emptyDescription} />
        ) : (
          <Tree
            treeData={filteredTreeData}
            expandedKeys={keyword ? visibleKeys : expandedKeys}
            onExpand={(keys) => setExpandedKeys(keys.map(String))}
            selectedKeys={selectedKey ? [selectedKey] : []}
            onSelect={(keys) => {
              if (keys[0]) setSelectedKey(String(keys[0]))
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
