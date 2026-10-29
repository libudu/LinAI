import { resolveSharedFolderIds } from '@/shared/eagle/sharing'
import {
  EAGLE_TRASH_FOLDER_ID,
  EAGLE_UNCLASSIFIED_FOLDER_ID,
  type EagleFolder,
  type EagleMediaType,
} from '@/shared/eagle/types'
import {
  DeleteOutlined,
  FolderOpenOutlined,
  FolderOutlined,
} from '@ant-design/icons'
import type { TreeDataNode, TreeProps } from 'antd'
import { message, Segmented, Switch, Tree } from 'antd'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useEagleConfig } from '../settings/useEagleConfig'
import { useFolderDownloads } from '../sharing/FolderDownloads'
import { useFolderSharing } from '../sharing/folderSharing'
import { requestEagleLibraryRefresh, useEagleStore } from '../store'
import { EditFolderModal } from './EditFolderModal'
import { FolderContextMenu } from './FolderContextMenu'
import './FolderTree.scss'
import { useFolderExpansion } from './useFolderExpansion'

// 节点标题：名称 + 灰色数量，开启展示时在名称下方加一行浅灰描述（单行超长省略）
const renderTitle = (
  name: string,
  count: number | string,
  description?: string,
  showDescription?: boolean,
) => (
  <span className="flex min-w-0 flex-col items-start">
    <span className="inline-flex max-w-full items-baseline gap-1">
      <span className="truncate" title={name}>
        {name}
      </span>
      <span className="shrink-0 text-sm text-slate-400">({count})</span>
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

interface SharingControls {
  visible: boolean
  shared: ReadonlySet<string>
  everyone: ReadonlySet<string>
  perUser: boolean
  disabled: boolean
  saving: boolean
  onChange: (folderId: string, shared: boolean) => Promise<void>
}

const toTreeData = (
  folders: EagleFolder[],
  onEdit: (folder: EagleFolder) => void,
  showDescription: boolean,
  showEmptyFolders: boolean,
  sharing: SharingControls,
  renderDownload: (folder: EagleFolder) => ReactNode,
): TreeDataNode[] =>
  folders
    .filter((folder) => showEmptyFolders || folder.totalCount > 0)
    .map((folder) => ({
      key: folder.id,
      title: (
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1">
            <FolderContextMenu folder={folder} onEdit={onEdit}>
              {renderTitle(
                folder.name,
                folder.children.length > 0 && folder.count > 0
                  ? `${folder.count}/${folder.totalCount}`
                  : folder.totalCount,
                folder.description,
                showDescription,
              )}
            </FolderContextMenu>
          </span>
          {sharing.visible && (
            <span
              className="shrink-0"
              onClick={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
              onContextMenu={(event) => event.stopPropagation()}
              title={
                sharing.perUser && sharing.everyone.has(folder.id)
                  ? '已对所有人开放，不能单独关闭'
                  : '同步设置此文件夹及全部子文件夹的共享权限，子文件夹可单独调整'
              }
            >
              <Switch
                size="small"
                aria-label={`${folder.name}的共享权限`}
                checked={sharing.shared.has(folder.id)}
                disabled={
                  sharing.disabled ||
                  sharing.saving ||
                  (sharing.perUser && sharing.everyone.has(folder.id))
                }
                onChange={(checked) => {
                  void sharing
                    .onChange(folder.id, checked)
                    .catch((error) =>
                      message.error(
                        error instanceof Error
                          ? error.message
                          : '保存共享权限失败',
                      ),
                    )
                }}
              />
            </span>
          )}
          {renderDownload(folder)}
        </span>
      ),
      children: toTreeData(
        folder.children,
        onEdit,
        showDescription,
        showEmptyFolders,
        sharing,
        renderDownload,
      ),
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
    mediaType,
    setMediaType,
    allTotal,
    unclassifiedTotal,
    trashTotal,
    showFolderDescription,
    showEmptyFolders,
  } = useEagleStore()
  const { libraryMode, libraryPath } = useEagleConfig()
  const downloads = useFolderDownloads(folders, mediaType)
  const sharing = useFolderSharing()
  const sharingControls = useMemo<SharingControls>(() => {
    const library = sharing.value.libraries.find(
      (entry) => entry.libraryPath === libraryPath,
    )
    const selectionVersion = library?.selectionVersion ?? 1
    const selectedUser = sharing.users.find(
      (user) => user.invitationCode === sharing.selectedCode,
    )
    const permissionKey =
      selectedUser?.folderSharingCode ?? sharing.selectedCode
    const everyone = resolveSharedFolderIds(
      folders,
      library?.everyone ?? [],
      selectionVersion,
    )
    return {
      visible: libraryMode === 'local' && sharing.view !== 'hidden',
      everyone,
      shared:
        sharing.view === 'user'
          ? resolveSharedFolderIds(
              folders,
              [
                ...(library?.everyone ?? []),
                ...(library?.users[permissionKey] ?? []),
              ],
              selectionVersion,
            )
          : everyone,
      perUser: sharing.view === 'user',
      disabled:
        !sharing.loaded ||
        sharing.loading ||
        foldersLoading ||
        (sharing.view === 'user' && !selectedUser),
      saving: sharing.saving,
      onChange: sharing.setFolderShared,
    }
  }, [folders, foldersLoading, libraryMode, libraryPath, sharing])
  const { expandedKeys, expandedStateLoaded, handleExpand, revealAncestors } =
    useFolderExpansion(folders)
  const [editingFolder, setEditingFolder] = useState<EagleFolder | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const initialSelectionRevealedRef = useRef(false)
  const fixedTreeData = useMemo<TreeDataNode[]>(() => {
    const nodes: TreeDataNode[] = [
      { key: '', title: renderTitle('全部', allTotal), children: undefined },
    ]
    if (libraryMode === 'local') {
      nodes.push(
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
      )
    }
    return nodes
  }, [libraryMode, allTotal, unclassifiedTotal, trashTotal])
  const treeData = useMemo<TreeDataNode[]>(
    () =>
      toTreeData(
        folders,
        setEditingFolder,
        showFolderDescription,
        showEmptyFolders,
        sharingControls,
        downloads.renderButton,
      ),
    [
      folders,
      showFolderDescription,
      showEmptyFolders,
      sharingControls,
      downloads.renderButton,
    ],
  )
  const treeProps: TreeProps = {
    selectedKeys: [currentFolderId],
    onSelect: (keys) => {
      // 重复点击已选节点时 Tree 会返回空数组，保留当前目录。
      if (keys.length === 0) return
      selectFolder(keys[0] as string)
      onSelected?.()
    },
    showIcon: true,
    icon: (nodeProps) => {
      const isTrash =
        (nodeProps as { data?: { key?: string } })?.data?.key ===
          EAGLE_TRASH_FOLDER_ID ||
        (nodeProps as { eventKey?: string })?.eventKey === EAGLE_TRASH_FOLDER_ID
      if (isTrash) return <DeleteOutlined />
      return nodeProps.expanded ? <FolderOpenOutlined /> : <FolderOutlined />
    },
    blockNode: true,
  }

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
    <div className="eagle-folder-tree flex h-full min-h-0 flex-col overflow-hidden">
      <Segmented<EagleMediaType>
        block
        size="large"
        className="shrink-0"
        style={{ padding: 4, borderRadius: 0 }}
        value={mediaType}
        options={[
          { value: 'image', label: '图片' },
          { value: 'video', label: '视频' },
        ]}
        onChange={(value) => {
          void setMediaType(value).catch((error) => {
            console.error('切换 Eagle 资源类型失败', error)
            message.error('加载资源失败，请刷新重试')
          })
        }}
      />
      <div className="shrink-0 pt-1">
        <Tree {...treeProps} treeData={fixedTreeData} />
      </div>
      <div
        ref={scrollContainerRef}
        className="min-h-0 flex-1 overflow-y-auto pb-1"
      >
        <Tree
          {...treeProps}
          treeData={treeData}
          expandedKeys={expandedKeys}
          onExpand={handleExpand}
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
      {downloads.modal}
    </div>
  )
}
