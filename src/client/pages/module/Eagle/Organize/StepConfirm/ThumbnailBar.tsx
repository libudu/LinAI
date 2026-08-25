import type { OrganizeResultListItem } from '@/shared/eagle/organize'
import type { EagleFolder } from '@/shared/eagle/types'
import { FolderOutlined } from '@ant-design/icons'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useMemo, useRef } from 'react'
import { eagleThumbnailUrl } from '../../api'
import { ConfirmControls } from './ConfirmControls'

export type OrganizeSortType =
  | 'completion'
  | 'category'
  | 'mtime_desc'
  | 'mtime_asc'

export const getOrganizeItemCategory = (
  item: OrganizeResultListItem,
): string => {
  return item.folderPaths?.[0] || '未分类'
}

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

/**
 * 待确认结果排序函数：
 * 1. category（图片分类，默认）：按推荐的第一分类，从数量最多到数量最少；数量相同时按文件夹树先后顺序排；同分类内保持完成顺序
 * 2. completion（完成顺序）：按任务完成时的队列添加顺序（updatedAt 正序）
 * 3. mtime_desc / mtime_asc（图片修改时间）：按图片原文件修改时间倒序 / 正序
 */
export function sortOrganizeResults(
  results: OrganizeResultListItem[],
  sortType: OrganizeSortType,
  folders: EagleFolder[],
): OrganizeResultListItem[] {
  if (results.length <= 1) return results

  if (sortType === 'completion') {
    return [...results].sort((a, b) => a.updatedAt - b.updatedAt)
  }

  if (sortType === 'mtime_desc') {
    return [...results].sort(
      (a, b) => (b.mtime ?? 0) - (a.mtime ?? 0) || a.updatedAt - b.updatedAt,
    )
  }

  if (sortType === 'mtime_asc') {
    return [...results].sort(
      (a, b) => (a.mtime ?? 0) - (b.mtime ?? 0) || a.updatedAt - b.updatedAt,
    )
  }

  if (sortType === 'category') {
    const getPrimaryCategory = (item: OrganizeResultListItem): string => {
      return item.folderPaths?.[0] ?? ''
    }

    // 统计各第一分类数量
    const categoryCounts = new Map<string, number>()
    for (const item of results) {
      const cat = getPrimaryCategory(item)
      categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1)
    }

    // 构建 Eagle 文件夹树深度优先遍历顺序
    const folderOrderMap = new Map<string, number>()
    let orderIndex = 0
    const walkFolders = (nodes: EagleFolder[], parentPath = '') => {
      for (const node of nodes) {
        const fullPath = parentPath ? `${parentPath}/${node.name}` : node.name
        folderOrderMap.set(fullPath, orderIndex++)
        if (node.children?.length) {
          walkFolders(node.children, fullPath)
        }
      }
    }
    walkFolders(folders)

    return [...results].sort((a, b) => {
      const catA = getPrimaryCategory(a)
      const catB = getPrimaryCategory(b)

      if (catA === catB) {
        return a.updatedAt - b.updatedAt
      }

      const countA = categoryCounts.get(catA) ?? 0
      const countB = categoryCounts.get(catB) ?? 0

      // 1. 从数量最多到数量最少
      if (countA !== countB) {
        return countB - countA
      }

      // 2. 数量相同时按文件夹先后顺序排（未在树中的排在最后）
      const orderA = catA ? (folderOrderMap.get(catA) ?? 999999) : Infinity
      const orderB = catB ? (folderOrderMap.get(catB) ?? 999999) : Infinity
      if (orderA !== orderB) {
        return orderA - orderB
      }

      // 3. 文件夹树中都未找到时按字母拼音顺序兜底
      const comp = catA.localeCompare(catB, 'zh-CN')
      if (comp !== 0) return comp

      return a.updatedAt - b.updatedAt
    })
  }

  return results
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
        className="min-w-0 flex-1 overflow-x-auto rounded-lg"
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
                    className="flex h-24 w-24 flex-col items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50/80 px-2 py-1 text-center select-none dark:border-slate-600 dark:bg-slate-800/60"
                    title={`${item.categoryName}（剩余 ${item.remainingCount} 张）`}
                  >
                    <FolderOutlined className="mb-0.5 text-xs text-slate-400 dark:text-slate-500" />
                    <span className="line-clamp-2 max-w-[84px] text-xs leading-tight font-medium break-all text-slate-700 dark:text-slate-200">
                      {item.categoryName}
                    </span>
                    <span className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
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
