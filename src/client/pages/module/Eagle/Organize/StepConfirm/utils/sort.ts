import type { OrganizeResultListItem } from '@/shared/eagle/organize'
import type { EagleFolder } from '@/shared/eagle/types'
import {
  SPECIAL_CATEGORY_LOW_QUALITY,
  SPECIAL_CATEGORY_UNCLASSIFIED,
  type OrganizeSortType,
} from '../types'

/**
 * 提取条目的展示分类名称：
 * 1. 若标记为疑似低质（lowQuality === true），无视其 AI 推荐分类，统一返回「疑似低质」以便优先集中处理；
 *    注意：此归类仅用于前端视图分组与排序展示，不会修改条目底层的 folderPaths，确认时依然按原推荐路径归档。
 * 2. 若未标记低质，取首选推荐路径 folderPaths[0]；若 folderPaths 为空数组 []，则归为「未分类」。
 */
export const getOrganizeItemCategory = (
  item: OrganizeResultListItem,
): string => {
  if (item.lowQuality) {
    return SPECIAL_CATEGORY_LOW_QUALITY
  }
  return item.folderPaths?.[0] || SPECIAL_CATEGORY_UNCLASSIFIED
}

/**
 * 分类顺序锁（Category Order Lock）：
 * 解决在图片整理确认过程中，某一分类的图片随着处理越来越少，重开窗口时由于剩余数量减少导致
 * 刚刚分类到一半的类别被排到后面的问题。
 *
 * 原理：
 * 1. 排除特殊置顶分类（「疑似低质」与「未分类」拥有最高固定排位，不参与常规分类的顺序锁定）；
 * 2. 保持已有顺序（existingOrder）中分类的前后相对排位绝对不变；
 * 3. 若任务追加了新图片并引入了先前不存在的新分类，则对新分类按数量从多到少、文件夹层级及拼音排序后，追加到已固化顺序的末尾。
 */
export function getOrUpdateCategoryOrder(
  results: OrganizeResultListItem[],
  folders: EagleFolder[],
  existingOrder: string[] = [],
): string[] {
  const existingSet = new Set(existingOrder)
  const categoryCounts = new Map<string, number>()
  for (const item of results) {
    const cat = getOrganizeItemCategory(item)
    // 排除特殊分类（固定置顶展示，不参与常规顺序锁）
    if (
      cat === SPECIAL_CATEGORY_LOW_QUALITY ||
      cat === SPECIAL_CATEGORY_UNCLASSIFIED
    ) {
      continue
    }
    categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1)
  }

  // 筛选出尚未在已有顺序中的新分类
  const newCategories: string[] = []
  for (const cat of categoryCounts.keys()) {
    if (!existingSet.has(cat)) {
      newCategories.push(cat)
    }
  }

  // 没有新分类时直接复用已锁定顺序，避免任何不必要的重新排位
  if (newCategories.length === 0) {
    return existingOrder
  }

  // 构建 Eagle 文件夹树深度优先遍历顺序，作为同数量新分类排位的依据
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

  // 对新分类排序：1. 数量降序；2. 文件夹树顺序；3. 拼音顺序兜底
  newCategories.sort((catA, catB) => {
    const countA = categoryCounts.get(catA) ?? 0
    const countB = categoryCounts.get(catB) ?? 0
    if (countA !== countB) return countB - countA
    const orderA = folderOrderMap.get(catA) ?? 999999
    const orderB = folderOrderMap.get(catB) ?? 999999
    if (orderA !== orderB) return orderA - orderB
    return catA.localeCompare(catB, 'zh-CN')
  })

  // 将新分类追加到固化顺序表尾部
  return [...existingOrder, ...newCategories]
}

/**
 * 待确认结果多维排序函数：
 *
 * 1. category（图片分类，默认）：
 *    - 第一层：特殊分类置顶 —— 疑似低质（优先级 0）> 未分类（优先级 1）> 常规分类（优先级 2）
 *    - 第二层：常规分类次序 —— 严格遵循任务固化的 categoryOrder（避免中途数量减少排位跳动）
 *    - 第三层：固化表外兜底 —— 按当前剩余数量从多到少，数量相同时按文件夹树先后顺序排
 *    - 第四层：同分类内项 —— 保持任务完成顺序（updatedAt 正序）
 * 2. completion（完成顺序）：按任务完成时的队列添加顺序（updatedAt 正序）
 * 3. mtime_desc / mtime_asc（图片修改时间）：按图片原文件修改时间倒序 / 正序
 */
export function sortOrganizeResults(
  results: OrganizeResultListItem[],
  sortType: OrganizeSortType,
  folders: EagleFolder[],
  categoryOrder?: string[],
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
    // 建立固化顺序映射，便于 O(1) 查询排位权重
    const categoryOrderMap = new Map<string, number>()
    if (categoryOrder) {
      categoryOrder.forEach((cat, idx) => categoryOrderMap.set(cat, idx))
    }

    // 统计各分类当前剩余数量（作为未在固化顺序中的排位依据）
    const categoryCounts = new Map<string, number>()
    for (const item of results) {
      const cat = getOrganizeItemCategory(item)
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

    // 特殊置顶分类优先级定义
    const getCategoryPriority = (cat: string): number => {
      if (cat === SPECIAL_CATEGORY_LOW_QUALITY) return 0 // 疑似低质最先展示
      if (cat === SPECIAL_CATEGORY_UNCLASSIFIED) return 1 // 无法分类其次展示
      return 2 // 常规文件夹分类
    }

    return [...results].sort((a, b) => {
      const catA = getOrganizeItemCategory(a)
      const catB = getOrganizeItemCategory(b)

      // 同一分类内的条目：保持任务完成的先后顺序
      if (catA === catB) {
        return a.updatedAt - b.updatedAt
      }

      // 1. 特殊分类置顶（疑似低质 -> 未分类 -> 常规分类）
      const priorityA = getCategoryPriority(catA)
      const priorityB = getCategoryPriority(catB)
      if (priorityA !== priorityB) {
        return priorityA - priorityB
      }

      // 2. 常规分类优先使用固化顺序表（保证中途确认数量递减时不会乱跳）
      const orderA = categoryOrderMap.has(catA)
        ? categoryOrderMap.get(catA)!
        : 999999
      const orderB = categoryOrderMap.has(catB)
        ? categoryOrderMap.get(catB)!
        : 999999
      if (orderA !== orderB) {
        return orderA - orderB
      }

      // 3. 未在固化顺序中的类别：从数量最多到数量最少
      const countA = categoryCounts.get(catA) ?? 0
      const countB = categoryCounts.get(catB) ?? 0
      if (countA !== countB) {
        return countB - countA
      }

      // 4. 数量相同时按文件夹先后顺序排（未在树中的排在最后）
      const treeA = catA ? (folderOrderMap.get(catA) ?? 999999) : Infinity
      const treeB = catB ? (folderOrderMap.get(catB) ?? 999999) : Infinity
      if (treeA !== treeB) {
        return treeA - treeB
      }

      // 5. 文件夹树中都未找到时按字母拼音顺序兜底
      const comp = catA.localeCompare(catB, 'zh-CN')
      if (comp !== 0) return comp

      return a.updatedAt - b.updatedAt
    })
  }

  return results
}
