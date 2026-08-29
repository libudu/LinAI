import type { OrganizeResultListItem } from '@/shared/eagle/organize'
import {
  CheckOutlined,
  FolderOutlined,
  PictureOutlined,
} from '@ant-design/icons'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Button, Image } from 'antd'
import React, { useEffect, useMemo, useRef } from 'react'
import { eagleFileUrl, eagleThumbnailUrl } from '../../api'
import { getOrganizeItemCategory, type OrganizeSortType } from './ThumbnailBar'

type VirtualQuickItem =
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

interface QuickCardProps {
  result: OrganizeResultListItem
  isSelected: boolean
  actionLoading: boolean
  onSelect: (itemId: string) => void
  onConfirmItem: (item: OrganizeResultListItem) => void
  onClearClassification: (item: OrganizeResultListItem) => void
  onSkipItem: (item: OrganizeResultListItem) => void
}

const QuickCard = React.memo(function QuickCard({
  result,
  isSelected,
  actionLoading,
  onSelect,
  onConfirmItem,
  onClearClassification,
  onSkipItem,
}: QuickCardProps) {
  const categoryName = getOrganizeItemCategory(result)

  return (
    <div
      onClick={() => onSelect(result.itemId)}
      className={`group relative flex h-[390px] w-64 shrink-0 flex-col overflow-hidden rounded-xl border-2 transition-colors duration-150 ${
        isSelected
          ? 'border-blue-500 bg-blue-50/30 shadow-lg shadow-blue-500/10 dark:border-blue-500 dark:bg-blue-900/10 dark:shadow-blue-500/20'
          : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/80 dark:hover:border-slate-600'
      }`}
    >
      {/* 顶部图片缩略图区域 */}
      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden bg-slate-100 dark:bg-slate-900/50"
        onClick={() => onSelect(result.itemId)}
      >
        <Image
          src={eagleThumbnailUrl(result.itemId)}
          preview={{ src: eagleFileUrl(result.itemId) }}
          alt={categoryName}
          loading="lazy"
          placeholder={
            <div className="flex h-full w-full items-center justify-center">
              <PictureOutlined className="text-3xl text-slate-300 opacity-40 dark:text-slate-600" />
            </div>
          }
          classNames={{
            root: 'h-full w-full flex items-center justify-center',
            image:
              'h-full! w-full! object-contain! p-2 transition-transform duration-200 group-hover:scale-105',
          }}
        />
      </div>

      {/* 底部信息与操作栏 */}
      <div className="flex shrink-0 flex-col gap-2 border-t border-slate-100 p-3 dark:border-slate-700/60">
        <Button
          type="primary"
          size="large"
          icon={<CheckOutlined />}
          disabled={actionLoading}
          onClick={(e) => {
            e.stopPropagation()
            onConfirmItem(result)
          }}
          className="h-12! w-full font-bold"
        >
          确定(D)
        </Button>

        <div className="grid grid-cols-2 gap-1.5">
          <Button
            disabled={actionLoading}
            onClick={(e) => {
              e.stopPropagation()
              onClearClassification(result)
            }}
            className="px-1 text-xs"
          >
            清除分类(A)
          </Button>
          <Button
            disabled={actionLoading}
            onClick={(e) => {
              e.stopPropagation()
              onSkipItem(result)
            }}
            className="px-1 text-xs"
          >
            不处理(S)
          </Button>
        </div>
      </div>
    </div>
  )
})

interface QuickConfirmListProps {
  results: OrganizeResultListItem[]
  selectedId: string | null
  onSelect: (itemId: string) => void
  onConfirmItem: (item: OrganizeResultListItem) => void
  onClearClassification: (item: OrganizeResultListItem) => void
  onSkipItem: (item: OrganizeResultListItem) => void
  sortType: OrganizeSortType
  actionLoading: boolean
}

export function QuickConfirmList({
  results,
  selectedId,
  onSelect,
  onConfirmItem,
  onClearClassification,
  onSkipItem,
  sortType,
  actionLoading,
}: QuickConfirmListProps) {
  const parentRef = useRef<HTMLDivElement>(null)

  // 将分类标题与卡片项平铺为虚拟列表数据源
  const flatItems = useMemo<VirtualQuickItem[]>(() => {
    const categoryRemainingCounts = new Map<string, number>()
    for (const item of results) {
      const cat = getOrganizeItemCategory(item)
      categoryRemainingCounts.set(
        cat,
        (categoryRemainingCounts.get(cat) ?? 0) + 1,
      )
    }

    const list: VirtualQuickItem[] = []
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

  // 水平虚拟列表：卡片宽度 256px + gap 16px = 272px；分类卡片宽度 208px + gap 16px = 224px
  const virtualizer = useVirtualizer({
    horizontal: true,
    count: flatItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const item = flatItems[index]
      return item?.type === 'category' ? 224 : 272
    },
    overscan: 4,
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
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
      {/* 居中放大的卡片横向虚拟滚动容器 */}
      <div ref={parentRef} className="w-full overflow-x-auto px-6 py-4">
        <div
          style={{
            width: `${virtualizer.getTotalSize()}px`,
            height: '390px',
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
                  width: item.type === 'category' ? '208px' : '256px',
                  height: '390px',
                }}
              >
                {item.type === 'category' ? (
                  <div
                    className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-3 py-4 text-center select-none dark:border-slate-600 dark:bg-slate-800/50"
                    title={`${item.categoryName}（剩余 ${item.remainingCount} 张）`}
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-500 dark:bg-blue-900/30">
                      <FolderOutlined className="text-3xl" />
                    </div>
                    <span className="line-clamp-3 text-base font-bold break-all text-slate-800 dark:text-slate-100">
                      {item.categoryName}
                    </span>
                    <span className="rounded-full bg-slate-200/70 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                      剩余 {item.remainingCount} 张
                    </span>
                  </div>
                ) : (
                  <QuickCard
                    result={item.result}
                    isSelected={item.result.itemId === selectedId}
                    actionLoading={actionLoading}
                    onSelect={onSelect}
                    onConfirmItem={onConfirmItem}
                    onClearClassification={onClearClassification}
                    onSkipItem={onSkipItem}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
