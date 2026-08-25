import type { OrganizeFailedItem } from '@/shared/eagle/organize'
import { Button, Empty } from 'antd'
import { eagleThumbnailUrl } from '../../api'

interface FailedListProps {
  items: OrganizeFailedItem[]
  actionLoadingId: string | null
  onRetry: (itemId: string) => void
  onSkip: (itemId: string) => void
}

export function FailedList({
  items,
  actionLoadingId,
  onRetry,
  onSkip,
}: FailedListProps) {
  if (items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center py-6">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="太棒了，当前没有失败的任务"
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
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium text-slate-700 dark:text-slate-300">
              {item.itemName ?? item.itemId}
            </div>
            <div
              className="truncate text-[11px] text-red-500"
              title={item.error}
            >
              {item.error}
            </div>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <Button
              size="small"
              disabled={actionLoadingId === item.itemId}
              onClick={() => onSkip(item.itemId)}
            >
              跳过
            </Button>
            <Button
              size="small"
              type="primary"
              loading={actionLoadingId === item.itemId}
              onClick={() => onRetry(item.itemId)}
            >
              重试
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
