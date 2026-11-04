import type { OrganizeQueueItem } from '@/shared/eagle/organize'
import { Empty, Spin } from 'antd'
import { eagleThumbnailUrl } from '../../api'
import { ImagePendingContextMenu } from '../../components/ImagePendingContextMenu'
import { useOrganizeMedia } from '../media'

const QUEUE_STATE_TEXT: Record<OrganizeQueueItem['state'], string> = {
  processing: '执行中',
  pending: '等待中',
  failed: '失败',
}

const QUEUE_STATE_CLASS: Record<OrganizeQueueItem['state'], string> = {
  processing: 'text-sky-500',
  pending: 'text-slate-400',
  failed: 'text-red-500',
}

interface QueueListProps {
  items: OrganizeQueueItem[]
  loading?: boolean
  showState?: boolean
  emptyDescription?: string
}

export function QueueList({
  items,
  loading,
  showState = true,
  emptyDescription = '没有排队中或执行中的条目',
}: QueueListProps) {
  const { mediaType } = useOrganizeMedia()
  if (loading && items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center py-6">
        <Spin />
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center py-6">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={emptyDescription}
        />
      </div>
    )
  }

  return (
    <div className="h-full divide-y divide-slate-100 overflow-y-auto dark:divide-slate-700/60">
      {items.map((item, index) => (
        <div key={item.itemId} className="flex items-center gap-3 px-1 py-2">
          <ImagePendingContextMenu
            itemId={item.itemId}
            disabled={mediaType !== 'image'}
          >
            <img
              src={eagleThumbnailUrl(item.itemId)}
              alt=""
              loading="lazy"
              className="h-10 w-10 shrink-0 rounded object-cover"
            />
          </ImagePendingContextMenu>
          <span
            className={`w-14 shrink-0 text-xs font-medium ${showState ? QUEUE_STATE_CLASS[item.state] : 'text-slate-400'}`}
          >
            {showState ? QUEUE_STATE_TEXT[item.state] : index + 1}
          </span>
          <span
            className="min-w-0 flex-1 truncate text-xs text-slate-500 dark:text-slate-400"
            title={item.itemName ?? undefined}
          >
            {item.itemName ?? item.itemId}
          </span>
        </div>
      ))}
    </div>
  )
}
