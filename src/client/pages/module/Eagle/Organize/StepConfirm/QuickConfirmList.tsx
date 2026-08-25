import type { OrganizeResultListItem } from '@/shared/eagle/organize'
import { CheckOutlined, FolderOutlined } from '@ant-design/icons'
import { Button, Image } from 'antd'
import { Fragment, useEffect, useMemo, useRef } from 'react'
import { eagleFileUrl, eagleThumbnailUrl } from '../../api'
import { getOrganizeItemCategory, type OrganizeSortType } from './ThumbnailBar'

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
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const categoryRemainingCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of results) {
      const cat = getOrganizeItemCategory(item)
      counts.set(cat, (counts.get(cat) ?? 0) + 1)
    }
    return counts
  }, [results])

  // 选中项变化时平滑滚动到可见区域
  useEffect(() => {
    if (selectedId) {
      const el = itemRefs.current.get(selectedId)
      el?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      })
    }
  }, [selectedId])

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
      {/* 居中放大的卡片横向滚动容器 */}
      <div className="flex w-full items-center gap-4 overflow-x-auto px-6 py-4">
        {results.map((result, index) => {
          const categoryName = getOrganizeItemCategory(result)
          const isFirstOfCategory =
            sortType === 'category' &&
            (index === 0 ||
              getOrganizeItemCategory(results[index - 1]) !== categoryName)
          const remainingCount = categoryRemainingCounts.get(categoryName) ?? 0
          const isSelected = result.itemId === selectedId

          return (
            <Fragment key={result.itemId}>
              {isFirstOfCategory && (
                <div
                  className="flex h-[390px] w-52 shrink-0 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-3 py-4 text-center select-none dark:border-slate-600 dark:bg-slate-800/50"
                  title={`${categoryName}（剩余 ${remainingCount} 张）`}
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-500 dark:bg-blue-900/30">
                    <FolderOutlined className="text-3xl" />
                  </div>
                  <span className="line-clamp-3 text-base font-bold break-all text-slate-800 dark:text-slate-100">
                    {categoryName}
                  </span>
                  <span className="rounded-full bg-slate-200/70 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    剩余 {remainingCount} 张
                  </span>
                </div>
              )}

              <div
                ref={(el) => {
                  if (el) itemRefs.current.set(result.itemId, el)
                  else itemRefs.current.delete(result.itemId)
                }}
                onClick={() => onSelect(result.itemId)}
                className={`group relative flex h-[390px] w-64 shrink-0 flex-col overflow-hidden rounded-xl border-2 transition-all duration-150 ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50/30 shadow-lg shadow-blue-500/10 dark:border-blue-500 dark:bg-blue-900/10 dark:shadow-blue-500/20'
                    : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/80 dark:hover:border-slate-600'
                }`}
              >
                {/* 顶部图片缩略图区域 */}
                <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-slate-100 dark:bg-slate-900/50">
                  <Image
                    src={eagleThumbnailUrl(result.itemId)}
                    preview={{ src: eagleFileUrl(result.itemId) }}
                    alt={categoryName}
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
                    size="middle"
                    icon={<CheckOutlined />}
                    disabled={actionLoading}
                    onClick={(e) => {
                      e.stopPropagation()
                      onConfirmItem(result)
                    }}
                    className="w-full font-medium"
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
                      跳过(S)
                    </Button>
                  </div>
                </div>
              </div>
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
