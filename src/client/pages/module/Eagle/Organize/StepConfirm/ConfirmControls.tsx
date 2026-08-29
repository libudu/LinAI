import { SortAscendingOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { Select, Switch } from 'antd'
import type { OrganizeSortType } from './ThumbnailBar'

interface ConfirmControlsProps {
  sortType: OrganizeSortType
  onSortTypeChange: (sortType: OrganizeSortType) => void
  quickMode: boolean
  onQuickModeChange: (quickMode: boolean) => void
}

export function ConfirmControls({
  sortType,
  onSortTypeChange,
  quickMode,
  onQuickModeChange,
}: ConfirmControlsProps) {
  return (
    <div className="flex shrink-0 flex-col items-start justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/40">
      <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
        <SortAscendingOutlined />
        <span>排序方式</span>
      </div>
      <Select<OrganizeSortType>
        value={sortType}
        onChange={onSortTypeChange}
        className="w-28"
        options={[
          { value: 'category', label: '图片分类' },
          { value: 'completion', label: '完成顺序' },
          { value: 'mtime_desc', label: '修改时间 新→旧' },
          { value: 'mtime_asc', label: '修改时间 旧→新' },
        ]}
      />
      <div className="flex w-full items-center justify-between gap-1.5 pt-1.5">
        <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
          <ThunderboltOutlined
            className={quickMode ? 'text-amber-500' : 'text-slate-400'}
          />
          <span>快速模式</span>
        </div>
        <Switch checked={quickMode} onChange={onQuickModeChange} />
      </div>
    </div>
  )
}
