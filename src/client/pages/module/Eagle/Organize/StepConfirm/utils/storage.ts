import type { PinnedFolderOption } from '../types'

export const CONFIRM_SORT_STORAGE_KEY = 'eagle_organize_confirm_sort'
export const CONFIRM_QUICK_MODE_STORAGE_KEY = 'eagle_organize_confirm_quick_mode'
export const CONFIRM_CATEGORY_ORDER_STORAGE_PREFIX = 'eagle_organize_category_order'
export const CONFIRM_PINNED_OPTION_STORAGE_KEY = 'eagle_organize_pinned_option'

export const getSavedPinnedOption = (
  taskCreatedAt?: number,
): PinnedFolderOption | null => {
  try {
    const raw = sessionStorage.getItem(CONFIRM_PINNED_OPTION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.folderPath === 'string') {
      if (!taskCreatedAt || parsed.taskCreatedAt === taskCreatedAt) {
        return {
          key: parsed.key,
          type: parsed.type,
          folderPath: parsed.folderPath,
          folderId: parsed.folderId,
          count: parsed.count,
        }
      }
    }
  } catch {
    // 忽略异常
  }
  return null
}

export const savePinnedOption = (
  taskCreatedAt: number | undefined,
  option: PinnedFolderOption | null,
) => {
  try {
    if (option) {
      sessionStorage.setItem(
        CONFIRM_PINNED_OPTION_STORAGE_KEY,
        JSON.stringify({ ...option, taskCreatedAt }),
      )
    } else {
      sessionStorage.removeItem(CONFIRM_PINNED_OPTION_STORAGE_KEY)
    }
  } catch {
    // 忽略异常
  }
}

/**
 * 读取当前整理任务固化的分类排序列表。
 * 以 taskCreatedAt 作为存储键的后缀，确保：
 * 1. 同一个任务内多次打开弹窗或刷新页面时，始终复用已固化的分类先后顺序；
 * 2. 任务清空并创建新任务后，因 taskCreatedAt 变更而自动使用全新的分类顺序，互不干扰。
 */
export const getSavedCategoryOrder = (taskCreatedAt?: number): string[] => {
  try {
    const key = taskCreatedAt
      ? `${CONFIRM_CATEGORY_ORDER_STORAGE_PREFIX}_${taskCreatedAt}`
      : CONFIRM_CATEGORY_ORDER_STORAGE_PREFIX
    const raw = localStorage.getItem(key)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.every((s) => typeof s === 'string')) {
        return parsed
      }
    }
  } catch {
    // 忽略损坏的本地存储
  }
  return []
}

/**
 * 持久化保存当前任务的分类先后顺序列表。
 */
export const saveCategoryOrder = (
  taskCreatedAt: number | undefined,
  order: string[],
) => {
  try {
    const key = taskCreatedAt
      ? `${CONFIRM_CATEGORY_ORDER_STORAGE_PREFIX}_${taskCreatedAt}`
      : CONFIRM_CATEGORY_ORDER_STORAGE_PREFIX
    localStorage.setItem(key, JSON.stringify(order))
  } catch {
    // 忽略写入异常
  }
}
