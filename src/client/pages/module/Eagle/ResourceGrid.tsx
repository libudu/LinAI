import { usePlatform } from '@/client/hooks/usePlatform'
import { EAGLE_TRASH_FOLDER_ID, type EagleItem } from '@/shared/eagle/types'
import { DeleteOutlined, LoadingOutlined } from '@ant-design/icons'
import { Image, Pagination, Spin } from 'antd'
import { cloneElement, useMemo, useRef, useState, type ReactNode } from 'react'
import { eagleFileUrl } from './api'
import { FolderSelectModal } from './components/FolderSelectModal'
import { MediaEditSaveButton } from './components/MediaEditSaveButton'
import { ResourceGridItem } from './components/ResourceGridItem'
import { getRotationEditOperations } from './components/rotation'
import { VideoPreview } from './components/VideoPreview'
import { buildFolderMap, collectFolderKeys, findFolder } from './folders'
import { useResourceActions } from './hooks/useResourceActions'
import { useEagleConfig } from './settings/useEagleConfig'
import {
  PAGE_SIZE,
  requestEagleLibraryRefresh,
  useEagleStore,
  type EagleImageSize,
} from './store'

// 图片大小档位对应的网格列数（小档为原始密度，逐档递减一列）
const GRID_COLS: Record<EagleImageSize, string> = {
  small: 'grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
  medium: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
  large: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
}

// 右侧资源网格：固定大小格子 + object-cover 缩略图，底部分页翻页
export function ResourceGrid() {
  const remote = useEagleConfig((state) => state.libraryMode === 'remote')
  const {
    items,
    total,
    listLoading,
    page,
    setPage,
    imageSize,
    currentFolderId,
    keyword,
    folders,
    showSubfolderResources,
  } = useEagleStore()
  const showFileName = useEagleStore((s) => s.showFileName)
  const showFileSize = useEagleStore((s) => s.showFileSize)
  const { isMobile } = usePlatform()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewIndex, setPreviewIndex] = useState(0)
  const [previewItems, setPreviewItems] = useState<EagleItem[]>([])
  const [videoItem, setVideoItem] = useState<EagleItem | null>(null)
  const [savingMediaEdits, setSavingMediaEdits] = useState(false)
  const {
    movingItem,
    setMovingItem,
    initialFolderId,
    handleMoveFolder,
    handleDeleteItem,
    handleDownloadItem,
    handleTrashItem,
    trashingItem,
    handleAddToGallery,
    handlePurgeItem,
  } = useResourceActions(currentFolderId)

  // 预览组只收图片，视频使用独立播放器预览。
  const imageItems = items.filter((item) => !item.isVideo)
  const displayedImages = previewOpen ? previewItems : imageItems

  const resourceGroups = useMemo(() => {
    const root = showSubfolderResources
      ? findFolder(folders, currentFolderId)
      : null
    if (!root) return [{ id: '', path: '', items }]

    const folderMap = buildFolderMap(folders)
    const folderOrder = new Map(
      collectFolderKeys([root]).map((id, order) => [id, order]),
    )
    const groups = new Map<
      string,
      { id: string; path: string; items: EagleItem[] }
    >()
    for (const item of items) {
      // 与服务端一致，多归属资源放在当前范围中最靠前的目录下。
      let folderId = ''
      let firstOrder = Infinity
      for (const id of item.folders) {
        const order = folderOrder.get(id) ?? Infinity
        if (order < firstOrder) {
          folderId = id
          firstOrder = order
        }
      }
      let group = groups.get(folderId)
      if (!group) {
        group = {
          id: folderId,
          path: folderMap.get(folderId)?.path ?? '',
          items: [],
        }
        groups.set(folderId, group)
      }
      group.items.push(item)
    }
    return [...groups.values()]
  }, [items, folders, currentFolderId, showSubfolderResources])

  const handleClick = (item: EagleItem) => {
    if (item.isVideo) {
      setVideoItem(item)
      return
    }
    const index = imageItems.indexOf(item)
    setPreviewItems(imageItems)
    setPreviewIndex(Math.max(0, index))
    setPreviewOpen(true)
  }

  const handlePageChange = (next: number) => {
    setPage(next)
    scrollRef.current?.scrollTo({ top: 0 })
  }

  const isTrash = currentFolderId === EAGLE_TRASH_FOLDER_ID

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {listLoading && items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <Spin size="large" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-slate-400">
          {keyword ? '没有匹配的资源' : '暂无资源'}
        </div>
      ) : (
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
          <div className="space-y-4">
            {resourceGroups.map((group) => (
              <div key={group.id}>
                {group.path && (
                  <h3 className="mb-2 border-b border-slate-200 pb-1 text-xs font-normal break-all text-slate-400 dark:border-slate-700">
                    {group.path}
                  </h3>
                )}
                <div className={`grid gap-2 ${GRID_COLS[imageSize]}`}>
                  {group.items.map((item) => (
                    <ResourceGridItem
                      key={item.id}
                      item={item}
                      readOnly={remote}
                      isTrash={isTrash}
                      showFileName={showFileName}
                      showFileSize={showFileSize}
                      onClick={handleClick}
                      onMove={(targetItem) => setMovingItem(targetItem)}
                      onDelete={handleDeleteItem}
                      onDownload={handleDownloadItem}
                      onPurge={handlePurgeItem}
                      onAddToGallery={handleAddToGallery}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <FolderSelectModal
        open={movingItem !== null}
        onClose={() => setMovingItem(null)}
        onConfirm={handleMoveFolder}
        initialFolderId={initialFolderId}
      />

      {/* 底部分页栏 */}
      {total > 0 && (
        <div className="flex justify-center border-t border-slate-200 py-2 dark:border-slate-700">
          <Pagination
            current={page}
            total={total}
            pageSize={PAGE_SIZE}
            onChange={handlePageChange}
            showSizeChanger={false}
            simple={isMobile}
          />
        </div>
      )}

      <Image.PreviewGroup
        items={displayedImages.map((item) =>
          eagleFileUrl(item.id, item.contentVersion),
        )}
        preview={{
          open: previewOpen,
          current: previewIndex,
          onOpenChange: (open) => {
            if (!savingMediaEdits) setPreviewOpen(open)
          },
          onChange: (current) => {
            if (!savingMediaEdits) setPreviewIndex(current)
          },
          actionsRender: (originalNode, { current, transform }) => {
            const item = displayedImages[current]
            return (
              <div className="flex max-w-[90vw] flex-col items-center gap-3">
                {item && (
                  <div className="max-h-[20vh] w-full overflow-y-auto rounded-lg bg-black/40 px-3 py-2 text-center text-sm wrap-anywhere whitespace-pre-wrap text-white">
                    {item.name}.{item.ext}
                  </div>
                )}
                <div
                  className={
                    savingMediaEdits ? 'pointer-events-none opacity-50' : ''
                  }
                >
                  {cloneElement(
                    originalNode,
                    undefined,
                    (originalNode.props as { children?: ReactNode }).children,
                    item && !isTrash && !remote && (
                      <button
                        key="trash"
                        type="button"
                        title="移到回收站"
                        aria-label="移到回收站"
                        className={
                          trashingItem
                            ? 'ant-image-preview-actions-action ant-image-preview-actions-action-disabled'
                            : 'ant-image-preview-actions-action'
                        }
                        disabled={trashingItem}
                        onClick={(event) => {
                          event.stopPropagation()
                          void handleTrashItem(item, () =>
                            setPreviewOpen(false),
                          )
                        }}
                      >
                        {trashingItem ? (
                          <LoadingOutlined />
                        ) : (
                          <DeleteOutlined style={{ color: '#f87171' }} />
                        )}
                      </button>
                    ),
                  )}
                </div>
                {item && !isTrash && !remote && (
                  <MediaEditSaveButton
                    key={item.id}
                    id={item.id}
                    contentVersion={item.contentVersion}
                    operations={getRotationEditOperations(transform.rotate)}
                    onBusyChange={setSavingMediaEdits}
                    onSaved={() => {
                      setPreviewOpen(false)
                      setSavingMediaEdits(false)
                      void requestEagleLibraryRefresh().catch((error) =>
                        console.error('刷新编辑后的资源失败', error),
                      )
                    }}
                  />
                )}
              </div>
            )
          },
        }}
      />

      <VideoPreview
        item={videoItem}
        onClose={() => setVideoItem(null)}
        allowOverwrite={!isTrash && !remote}
        allowContactSheet={!remote}
      />
    </div>
  )
}
