import { useLongPressContextMenu } from '@/client/hooks/useLongPressContextMenu'
import { usePlatform } from '@/client/hooks/usePlatform'
import {
  EAGLE_TRASH_FOLDER_ID,
  EAGLE_UNCLASSIFIED_FOLDER_ID,
  type EagleItem,
} from '@/shared/eagle/types'
import {
  DeleteOutlined,
  FolderOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons'
import { Dropdown, Image, Modal, Pagination, Spin, message } from 'antd'
import { useRef, useState } from 'react'
import {
  eagleFileUrl,
  eagleThumbnailUrl,
  purgeEagleItem,
  updateEagleItem,
} from './api'
import { confirmDeleteEagleItem } from './components/confirmDeleteModal'
import {
  FolderSelectModal,
  type SelectedFolderInfo,
} from './components/FolderSelectModal'
import type { EagleImageSize } from './store'
import { PAGE_SIZE, useEagleStore } from './store'

// 图片大小档位对应的网格列数（小档为原始密度，逐档递减一列）
const GRID_COLS: Record<EagleImageSize, string> = {
  small: 'grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
  medium: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
  large: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
}

/** 格式化文件大小，如 0.1MB / 256KB */
const formatFileSize = (bytes: number) => {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`
  return `${bytes}B`
}

interface ResourceGridItemProps {
  item: EagleItem
  isTrash: boolean
  showFileName: boolean
  showFileSize: boolean
  onClick: (item: EagleItem) => void
  onMove: (item: EagleItem) => void
  onDelete: (item: EagleItem) => void
  onPurge: (item: EagleItem) => void
}

// 单个资源卡片：支持鼠标右键 / 移动端长按弹出操作菜单
function ResourceGridItem({
  item,
  isTrash,
  showFileName,
  showFileSize,
  onClick,
  onMove,
  onDelete,
  onPurge,
}: ResourceGridItemProps) {
  const longPressHandlers = useLongPressContextMenu()

  const menuItems = isTrash
    ? [
        {
          key: 'move',
          icon: <FolderOutlined />,
          label: '修改文件夹',
        },
        {
          key: 'purge',
          icon: <DeleteOutlined />,
          label: '彻底删除',
          danger: true,
        },
      ]
    : [
        {
          key: 'move',
          icon: <FolderOutlined />,
          label: '修改文件夹',
        },
        {
          key: 'delete',
          icon: <DeleteOutlined />,
          label: '移到回收站',
          danger: true,
        },
      ]

  return (
    <Dropdown
      trigger={['contextMenu']}
      menu={{
        items: menuItems,
        onClick: ({ key, domEvent }) => {
          domEvent.stopPropagation()
          if (key === 'move') {
            onMove(item)
          } else if (key === 'delete') {
            onDelete(item)
          } else if (key === 'purge') {
            onPurge(item)
          }
        },
      }}
      popupRender={(node) => (
        <div onClick={(e) => e.stopPropagation()}>{node}</div>
      )}
    >
      <div
        className="group relative aspect-square cursor-pointer overflow-hidden rounded-lg border-2 border-transparent bg-slate-100 transition-all select-none hover:border-blue-500 dark:bg-slate-800"
        style={{ WebkitTouchCallout: 'none' }}
        onClick={() => onClick(item)}
        title={item.name}
        {...longPressHandlers}
      >
        <img
          src={eagleThumbnailUrl(item.id)}
          alt={item.name}
          className="pointer-events-none h-full w-full object-cover"
          loading="lazy"
        />
        {(showFileName || showFileSize) && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/55 px-1 py-0.5 text-center text-[11px] leading-4 text-white">
            {showFileName && (
              <div className="truncate">
                {item.name}.{item.ext}
              </div>
            )}
            {showFileSize && (
              <div className="truncate">{formatFileSize(item.size)}</div>
            )}
          </div>
        )}
        {item.isVideo && (
          <div className="pointer-events-none absolute right-1 bottom-1 rounded bg-black/60 px-1.5 py-0.5 text-white">
            <PlayCircleOutlined />
          </div>
        )}
      </div>
    </Dropdown>
  )
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
    refreshCurrentPage,
    currentFolderId,
  } = useEagleStore()
  const showFileName = useEagleStore((s) => s.showFileName)
  const showFileSize = useEagleStore((s) => s.showFileSize)
  const { isMobile } = usePlatform()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewIndex, setPreviewIndex] = useState(0)
  const [videoItem, setVideoItem] = useState<EagleItem | null>(null)
  const [movingItem, setMovingItem] = useState<EagleItem | null>(null)

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

  const handleMoveFolder = async (folder: SelectedFolderInfo) => {
    if (!movingItem) return
    const folderIds =
      folder.id === EAGLE_UNCLASSIFIED_FOLDER_ID ? [] : [folder.id]
    try {
      await updateEagleItem(movingItem.id, { folderIds })
      message.success('已修改文件夹')
      await refreshCurrentPage()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '修改文件夹失败')
    }
  }

  const handleDeleteItem = (item: EagleItem) => {
    confirmDeleteEagleItem({
      id: item.id,
      name: item.name,
      onDeleted: () => refreshCurrentPage(),
    })
  }

  const handlePurgeItem = (item: EagleItem) => {
    Modal.confirm({
      title: '彻底删除',
      content: `确定要彻底删除「${item.name}」吗？此操作将从磁盘永久删除原文件且无法撤销。`,
      okText: '彻底删除',
      okType: 'danger',
      cancelText: '取消',
      centered: true,
      onOk: async () => {
        try {
          await purgeEagleItem(item.id)
          message.success('已彻底删除')
          await refreshCurrentPage()
        } catch (error) {
          message.error(error instanceof Error ? error.message : '删除失败')
        }
      },
    })
  }

  if (listLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spin size="large" />
      </div>
    )
  }

  const isTrash = currentFolderId === EAGLE_TRASH_FOLDER_ID

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-slate-400">
          暂无资源
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
              />
            ))}
          </div>
        </div>
      )}

      <FolderSelectModal
        open={movingItem !== null}
        onClose={() => setMovingItem(null)}
        onConfirm={handleMoveFolder}
        initialFolderId={currentFolderId || EAGLE_UNCLASSIFIED_FOLDER_ID}
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
