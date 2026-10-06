import { usePlatform } from '@/client/hooks/usePlatform'
import { EAGLE_TRASH_FOLDER_ID, type EagleItem } from '@/shared/eagle/types'
import { Image, Modal, Pagination, Spin } from 'antd'
import { useRef, useState } from 'react'
import { eagleFileUrl } from './api'
import { FolderSelectModal } from './components/FolderSelectModal'
import { ResourceGridItem } from './components/ResourceGridItem'
import { useResourceActions } from './hooks/useResourceActions'
import { PAGE_SIZE, useEagleStore, type EagleImageSize } from './store'

// 图片大小档位对应的网格列数（小档为原始密度，逐档递减一列）
const GRID_COLS: Record<EagleImageSize, string> = {
  small: 'grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
  medium: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
  large: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
}

// 右侧资源网格：固定大小格子 + object-cover 缩略图，底部分页翻页
export function ResourceGrid() {
  const {
    items,
    total,
    listLoading,
    page,
    setPage,
    imageSize,
    currentFolderId,
    keyword,
  } = useEagleStore()
  const showFileName = useEagleStore((s) => s.showFileName)
  const showFileSize = useEagleStore((s) => s.showFileSize)
  const { isMobile } = usePlatform()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewIndex, setPreviewIndex] = useState(0)
  const [videoItem, setVideoItem] = useState<EagleItem | null>(null)
  const {
    movingItem,
    setMovingItem,
    initialFolderId,
    handleMoveFolder,
    handleDeleteItem,
    handleAddToGallery,
    handlePurgeItem,
  } = useResourceActions(currentFolderId)

  // 预览组只收图片（视频走 Modal 播放）
  const imageItems = items.filter((item) => !item.isVideo)

  const handleClick = (item: EagleItem) => {
    if (item.isVideo) {
      setVideoItem(item)
      return
    }
    const index = imageItems.indexOf(item)
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
          <div className={`grid gap-2 ${GRID_COLS[imageSize]}`}>
            {items.map((item) => (
              <ResourceGridItem
                key={item.id}
                item={item}
                isTrash={isTrash}
                showFileName={showFileName}
                showFileSize={showFileSize}
                onClick={handleClick}
                onMove={(targetItem) => setMovingItem(targetItem)}
                onDelete={handleDeleteItem}
                onPurge={handlePurgeItem}
                onAddToGallery={handleAddToGallery}
              />
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
        items={imageItems.map((item) => eagleFileUrl(item.id))}
        preview={{
          open: previewOpen,
          current: previewIndex,
          onOpenChange: (open) => setPreviewOpen(open),
          onChange: (current) => setPreviewIndex(current),
        }}
      />

      <Modal
        open={videoItem !== null}
        footer={null}
        onCancel={() => setVideoItem(null)}
        width="80vw"
        centered
        destroyOnHidden
        title={videoItem?.name}
      >
        {videoItem && (
          <video
            src={eagleFileUrl(videoItem.id)}
            controls
            autoPlay
            className="max-h-[70vh] w-full"
          />
        )}
      </Modal>
    </div>
  )
}
