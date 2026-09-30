import type { OrganizeResultListItem } from '@/shared/eagle/organize'
import type { OrganizeSortType } from '../types'
import { getOrganizeItemCategory } from './sort'

export type ConfirmListItem =
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

/** 两种确认视图共用平铺数据；分类排序时在每组首项前插入标题和剩余数量。 */
export const buildConfirmListItems = (
  results: OrganizeResultListItem[],
  sortType: OrganizeSortType,
): ConfirmListItem[] => {
  const categoryCounts = new Map<string, number>()
  if (sortType === 'category') {
    for (const item of results) {
      const category = getOrganizeItemCategory(item)
      categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1)
    }
  }

  const list: ConfirmListItem[] = []
  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    const categoryName = getOrganizeItemCategory(result)
    if (
      sortType === 'category' &&
      (i === 0 || getOrganizeItemCategory(results[i - 1]) !== categoryName)
    ) {
      list.push({
        type: 'category',
        id: `cat_${categoryName}_${i}`,
        categoryName,
        remainingCount: categoryCounts.get(categoryName) ?? 0,
      })
    }
    list.push({ type: 'card', id: result.itemId, result })
  }
  return list
}
