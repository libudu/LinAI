import type { OrganizeQueueItem } from '@/shared/eagle/organize'
import { Empty, Spin } from 'antd'
import { eagleThumbnailUrl } from '../../api'

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
}

export function QueueList({ items, loading }: QueueListProps) {
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
          description="没有排队中或执行中的条目"
        />
      </div>
    )
  }

  return (
    <div className="h-full divide-y divide-slate-100 overflow-y-auto dark:divide-slate-700/60">
      {items.map((item) => (
        <div key={item.itemId} className="flex items-center gap-3 px-1 py-2">
          <img
            src={eagleThumbnailUrl(item.itemId)}
            alt=""
            loading="lazy"
            className="h-10 w-10 shrink-0 rounded object-cover"
          />
          <span
            className={`w-14 shrink-0 text-xs font-medium ${QUEUE_STATE_CLASS[item.state]}`}
          >
            {QUEUE_STATE_TEXT[item.state]}
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
