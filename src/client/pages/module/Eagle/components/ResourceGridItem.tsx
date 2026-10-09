import { useLongPressContextMenu } from '@/client/hooks/useLongPressContextMenu'
import type { EagleItem } from '@/shared/eagle/types'
import {
  DeleteOutlined,
  FolderOutlined,
  PlayCircleOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import { Dropdown } from 'antd'
import { eagleThumbnailUrl } from '../api'
import { formatFileSize } from './formatFileSize'

interface ResourceGridItemProps {
  item: EagleItem
  isTrash: boolean
  showFileName: boolean
  showFileSize: boolean
  onClick: (item: EagleItem) => void
  onMove: (item: EagleItem) => void
  onDelete: (item: EagleItem) => void
  onPurge: (item: EagleItem) => void
  onAddToGallery: (item: EagleItem) => Promise<void>
}

// 单个资源卡片：支持鼠标右键 / 移动端长按弹出操作菜单
export function ResourceGridItem({
  item,
  isTrash,
  showFileName,
  showFileSize,
  onClick,
  onMove,
  onDelete,
  onPurge,
  onAddToGallery,
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
        ...(!item.isVideo
          ? [
              {
                key: 'add-to-gallery',
                icon: <PlusOutlined />,
                label: '添加到待使用',
              },
            ]
          : []),
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
          } else if (key === 'add-to-gallery') {
            void onAddToGallery(item)
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
          src={eagleThumbnailUrl(item.id, item.contentVersion)}
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
