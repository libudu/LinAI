import type { OrganizeResultListItem } from '@/shared/eagle/organize'
import {
  FolderOutlined,
  QuestionCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useMemo, useRef } from 'react'
import { eagleThumbnailUrl } from '../../../api'
import {
  SPECIAL_CATEGORY_LOW_QUALITY,
  SPECIAL_CATEGORY_UNCLASSIFIED,
  type OrganizeSortType,
} from '../types'
import { getOrganizeItemCategory } from '../utils/sort'
import { ConfirmControls } from './ConfirmControls'

export {
  getOrganizeItemCategory,
  getOrUpdateCategoryOrder,
  sortOrganizeResults,
} from '../utils/sort'
export {
  SPECIAL_CATEGORY_LOW_QUALITY,
  SPECIAL_CATEGORY_UNCLASSIFIED,
  type OrganizeSortType,
} from '../types'

type VirtualThumbItem =
  | {
      type: 'category'
      id: string
      categoryName: string
      remainingCount: number
    }
  | {
      type: 'card'
      id: string
      result: OrganizeResultListItem
    }

interface ThumbnailBarProps {
  results: OrganizeResultListItem[]
  selectedId: string | null
  onSelect: (itemId: string) => void
  sortType: OrganizeSortType
  onSortTypeChange: (sortType: OrganizeSortType) => void
  quickMode: boolean
  onQuickModeChange: (quickMode: boolean) => void
}

export function ThumbnailBar({
  results,
  selectedId,
  onSelect,
  sortType,
  onSortTypeChange,
  quickMode,
  onQuickModeChange,
}: ThumbnailBarProps) {
  const parentRef = useRef<HTMLDivElement>(null)

  // 平铺分类标题与缩略图卡片项
  const flatItems = useMemo<VirtualThumbItem[]>(() => {
    const categoryRemainingCounts = new Map<string, number>()
    for (const item of results) {
      const cat = getOrganizeItemCategory(item)
      categoryRemainingCounts.set(
        cat,
        (categoryRemainingCounts.get(cat) ?? 0) + 1,
      )
    }

    const list: VirtualThumbItem[] = []
    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      const categoryName = getOrganizeItemCategory(result)
      const isFirstOfCategory =
        sortType === 'category' &&
        (i === 0 || getOrganizeItemCategory(results[i - 1]) !== categoryName)

      if (isFirstOfCategory) {
        list.push({
          type: 'category',
          id: `cat_${categoryName}_${i}`,
          categoryName,
          remainingCount: categoryRemainingCounts.get(categoryName) ?? 0,
        })
      }

      list.push({
        type: 'card',
        id: result.itemId,
        result,
      })
    }

    return list
  }, [results, sortType])

  // 水平虚拟列表：卡片宽度 96px + gap 8px = 104px
  const virtualizer = useVirtualizer({
    horizontal: true,
    count: flatItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 104,
    overscan: 6,
  })

  // 选中项切换时自动滚动到可视区域
  useEffect(() => {
    if (!selectedId) return
    const index = flatItems.findIndex(
      (it) => it.type === 'card' && it.result.itemId === selectedId,
    )
    if (index !== -1) {
      virtualizer.scrollToIndex(index, {
        align: 'auto',
        behavior: 'auto',
      })
    }
  }, [selectedId, flatItems, virtualizer])

  return (
    <div className="flex shrink-0 items-center gap-2">
      {/* 缩略图横向虚拟滚动列表 */}
      <div
        ref={parentRef}
        className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden rounded-lg"
      >
        <div
          style={{
            width: `${virtualizer.getTotalSize()}px`,
            height: '96px',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const item = flatItems[virtualItem.index]
            if (!item) return null

            return (
              <div
                key={item.id}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  transform: `translateX(${virtualItem.start}px)`,
                  width: '96px',
                  height: '96px',
                }}
              >
                {item.type === 'category' ? (
                  <div
                    className={`flex h-24 w-24 flex-col items-center justify-center rounded-md border border-dashed px-2 py-1 text-center select-none ${
                      item.categoryName === SPECIAL_CATEGORY_LOW_QUALITY
                        ? 'border-amber-400/80 bg-amber-50/80 dark:border-amber-600/80 dark:bg-amber-950/30'
                        : item.categoryName === SPECIAL_CATEGORY_UNCLASSIFIED
                          ? 'border-slate-300 bg-slate-100/80 dark:border-slate-600 dark:bg-slate-800/80'
                          : 'border-slate-300 bg-slate-50/80 dark:border-slate-600 dark:bg-slate-800/60'
                    }`}
                    title={`${item.categoryName}（剩余 ${item.remainingCount} 张）`}
                  >
                    {item.categoryName === SPECIAL_CATEGORY_LOW_QUALITY ? (
                      <WarningOutlined className="mb-0.5 text-xs text-amber-500 dark:text-amber-400" />
                    ) : item.categoryName === SPECIAL_CATEGORY_UNCLASSIFIED ? (
                      <QuestionCircleOutlined className="mb-0.5 text-xs text-slate-400 dark:text-slate-500" />
                    ) : (
                      <FolderOutlined className="mb-0.5 text-xs text-slate-400 dark:text-slate-500" />
                    )}
                    <span
                      className={`line-clamp-2 max-w-[84px] text-xs leading-tight font-medium break-all ${
                        item.categoryName === SPECIAL_CATEGORY_LOW_QUALITY
                          ? 'text-amber-700 dark:text-amber-300'
                          : 'text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {item.categoryName}
                    </span>
                    <span
                      className={`mt-0.5 text-[10px] ${
                        item.categoryName === SPECIAL_CATEGORY_LOW_QUALITY
                          ? 'text-amber-600/80 dark:text-amber-400/80'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      剩余 {item.remainingCount} 张
                    </span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelect(item.result.itemId)}
                    className={`relative h-24 w-24 shrink-0 overflow-hidden rounded-md border-2 transition-colors ${
                      item.result.itemId === selectedId
                        ? 'border-blue-500'
                        : 'border-transparent hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <img
                      src={eagleThumbnailUrl(item.result.itemId)}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      alt="thumbnail"
                    />
                    {item.result.lowQuality && (
                      <span className="absolute top-1 left-1 rounded bg-amber-500/90 px-1 py-0.5 text-[9px] font-bold text-white shadow-xs">
                        低质
                      </span>
                    )}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 右侧排序与快速模式组件 */}
      <ConfirmControls
        sortType={sortType}
        onSortTypeChange={onSortTypeChange}
        quickMode={quickMode}
        onQuickModeChange={onQuickModeChange}
      />
    </div>
  )
}
