import { settingsClient } from '@/client/service/settings'
import type { EagleFolder } from '@/shared/eagle/types'
import type { EagleFolderTreeSettings } from '@/server/module/eagle/settings'
import {
  FolderOpenOutlined,
  FolderOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import type { TreeDataNode } from 'antd'
import { Button, Checkbox, Dropdown, Tree } from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useEagleStore } from '../store'
import { EditFolderModal } from './EditFolderModal'
import { FolderContextMenu } from './FolderContextMenu'
import './FolderTree.scss'

const EXPANDED_STORAGE_KEY = 'eagle_folder_expanded'
const folderTreeClient =
  settingsClient<EagleFolderTreeSettings>('eagle-folder-tree')

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

// 收集全部文件夹 key（首次无本地记录时默认全展开）
const collectKeys = (folders: EagleFolder[]): string[] =>
  folders.flatMap((folder) => [folder.id, ...collectKeys(folder.children)])

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

// 读取旧版 localStorage 记录（仅用于向后端迁移一次），无记录返回 null
const loadLegacyExpandedKeys = (): string[] | null => {
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

// 左侧文件夹目录树：贴边拉满，展开状态持久化到后端设置（data/eagle/folder-tree.json），
// 节点带文件夹图标与图片数
// 顶部固定一个视图设置齿轮（不随目录树滚动，当前仅「显示文件夹描述」），
// 开启「显示文件夹描述」后节点名称下方展示浅灰描述（单行省略）
// 右键节点弹出菜单（编辑名称/描述，写回 Eagle 库 metadata.json）
export function FolderTree({ onSelected }: { onSelected?: () => void }) {
  const {
    folders,
    foldersLoading,
    currentFolderId,
    selectFolder,
    allTotal,
    refreshFolders,
    showFolderDescription,
    setShowFolderDescription,
  } = useEagleStore()
  // null = 尚无记录（未加载到或从未保存），回退为全展开
  const [storedKeys, setStoredKeys] = useState<string[] | null>(null)
  const [expandedStateLoaded, setExpandedStateLoaded] = useState(false)
  const [editingFolder, setEditingFolder] = useState<EagleFolder | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const initialSelectionRevealedRef = useRef(false)
  // 后端文档版本，PUT 时带上做冲突检测；undefined = 尚未加载
  const revisionRef = useRef<number | undefined>(undefined)
  // 用户在加载完成前手动展开/收起时，放弃应用后端拉回的旧状态
  const interactedRef = useRef(false)

  const treeData = useMemo<TreeDataNode[]>(
    () => [
      { key: '', title: renderTitle('全部', allTotal), children: undefined },
      ...toTreeData(folders, setEditingFolder, showFolderDescription),
    ],
    [folders, allTotal, showFolderDescription],
  )

  const allKeys = useMemo(() => collectKeys(folders), [folders])
  const expandedKeys = storedKeys ?? allKeys

  const saveExpanded = async (keys: string[]) => {
    try {
      const res = await folderTreeClient.put(
        { expandedFolderIds: keys },
        revisionRef.current,
      )
      revisionRef.current = res.revision
    } catch (error) {
      console.error('Failed to save folder tree expanded state', error)
    }
  }

  // 初始加载：读取后端记录的展开状态；后端无记录时迁移旧 localStorage 缓存（若有）
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let keys: string[] | null = null
      try {
        const res = await folderTreeClient.get()
        if (cancelled) return
        revisionRef.current = res.revision
        keys = res.value.expandedFolderIds
      } catch (error) {
        console.error('Failed to load folder tree expanded state', error)
      }
      if (keys === null) {
        const legacy = loadLegacyExpandedKeys()
        if (legacy) {
          keys = legacy
          localStorage.removeItem(EXPANDED_STORAGE_KEY)
          void saveExpanded(legacy)
        }
      }
      if (!cancelled && keys !== null && !interactedRef.current)
        setStoredKeys(keys)
      if (!cancelled) setExpandedStateLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

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
    setStoredKeys((current) =>
      current === null
        ? null
        : [...new Set([...current, ...ancestorKeys])],
    )

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
  }, [currentFolderId, expandedStateLoaded, folders, foldersLoading])

  const handleExpand = (keys: React.Key[]) => {
    const next = keys.map(String)
    interactedRef.current = true
    setStoredKeys(next)
    void saveExpanded(next)
  }

  return (
    <div className="flex h-full flex-col">
      {/* 顶部固定工具行：视图设置齿轮不随目录树滚动 */}
      <div className="flex justify-end border-b border-slate-200 px-2 py-1 dark:border-slate-700">
        <Dropdown
          trigger={['click']}
          menu={{ items: [] }}
          dropdownRender={() => (
            <div className="w-44 rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-800">
              <Checkbox
                checked={showFolderDescription}
                onChange={(e) => setShowFolderDescription(e.target.checked)}
              >
                显示文件夹描述
              </Checkbox>
            </div>
          )}
        >
          <Button icon={<SettingOutlined />} type="text" />
        </Dropdown>
      </div>
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
          icon={({ expanded }) =>
            expanded ? <FolderOpenOutlined /> : <FolderOutlined />
          }
          blockNode
        />
        {foldersLoading && (
          <div className="pt-2 text-center text-xs text-slate-400">加载中…</div>
        )}
      </div>

      <EditFolderModal
        folder={editingFolder}
        onClose={() => setEditingFolder(null)}
        onSaved={refreshFolders}
      />
    </div>
  )
}
