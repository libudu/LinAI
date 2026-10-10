import type { OrganizeResultListItem } from '@/shared/eagle/organize'
import { SortAscendingOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { Select, Switch } from 'antd'
import type { OrganizeSortType } from '../types'
import { PinnedCategoryControl } from './PinnedCategoryControl'

interface ConfirmControlsProps {
  renameOnly?: boolean
  sortType: OrganizeSortType
  onSortTypeChange: (sortType: OrganizeSortType) => void
  quickMode: boolean
  onQuickModeChange: (quickMode: boolean) => void
  results: OrganizeResultListItem[]
  pinnedCategory: string | null
  onPinnedCategoryChange: (category: string | null) => void
}

export function ConfirmControls({
  renameOnly = false,
  sortType,
  onSortTypeChange,
  quickMode,
  onQuickModeChange,
  results,
  pinnedCategory,
  onPinnedCategoryChange,
}: ConfirmControlsProps) {
  return (
    <div className="flex shrink-0 flex-col justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/40">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-xs whitespace-nowrap text-slate-500 dark:text-slate-400">
          <SortAscendingOutlined />
          <span>排序方式</span>
        </div>
        <Select<OrganizeSortType>
          value={sortType}
          onChange={onSortTypeChange}
          className="w-36"
          options={[
            ...(!renameOnly ? [{ value: 'category', label: '内容分类' }] : []),
            { value: 'completion', label: '完成顺序' },
            { value: 'lastModified_desc', label: '操作时间 新→旧' },
            { value: 'lastModified_asc', label: '操作时间 旧→新' },
            { value: 'mtime_desc', label: '修改时间 新→旧' },
            { value: 'mtime_asc', label: '修改时间 旧→新' },
          ]}
        />
      </div>
      {!renameOnly && (
        <PinnedCategoryControl
          results={results}
          pinnedCategory={pinnedCategory}
          onChange={onPinnedCategoryChange}
        />
      )}
      <div className="flex w-full items-center gap-2">
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
