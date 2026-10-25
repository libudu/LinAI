import type { PinnedFolderOption } from '../types'

export const CONFIRM_SORT_STORAGE_KEY = 'eagle_organize_confirm_sort'
export const CONFIRM_QUICK_MODE_STORAGE_KEY =
  'eagle_organize_confirm_quick_mode'
export const CONFIRM_CATEGORY_ORDER_STORAGE_PREFIX =
  'eagle_organize_category_order'
export const CONFIRM_PINNED_OPTION_STORAGE_KEY = 'eagle_organize_pinned_option'
const CONFIRM_PINNED_CATEGORY_STORAGE_KEY = 'eagle_organize_pinned_category'

/** 分堆置顶只在同一任务内复用，与确认目标文件夹的置顶独立。 */
export const getSavedPinnedCategory = (taskId?: string): string | null => {
  if (!taskId) return null
  try {
    const raw =
      sessionStorage.getItem(
        `${CONFIRM_PINNED_CATEGORY_STORAGE_KEY}_${taskId}`,
      ) ?? sessionStorage.getItem(CONFIRM_PINNED_CATEGORY_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.taskId === taskId && typeof parsed.category === 'string') {
      return parsed.category
    }
  } catch {
    // 忽略损坏的本地缓存
  }
  return null
}

export const savePinnedCategory = (taskId: string, category: string | null) => {
  try {
    if (category) {
      sessionStorage.setItem(
        `${CONFIRM_PINNED_CATEGORY_STORAGE_KEY}_${taskId}`,
        JSON.stringify({ taskId, category }),
      )
    } else {
      sessionStorage.setItem(
        `${CONFIRM_PINNED_CATEGORY_STORAGE_KEY}_${taskId}`,
        JSON.stringify({ taskId, category: null }),
      )
    }
  } catch {
    // 忽略写入异常
  }
}

export const getSavedPinnedOption = (
  taskId?: string,
  taskCreatedAt?: number,
): PinnedFolderOption | null => {
  try {
    if (!taskId) return null
    const raw =
      sessionStorage.getItem(
        `${CONFIRM_PINNED_OPTION_STORAGE_KEY}_${taskId}`,
      ) ?? sessionStorage.getItem(CONFIRM_PINNED_OPTION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.folderPath === 'string') {
      if (
        parsed.taskId === taskId ||
        (parsed.taskId === undefined &&
          taskCreatedAt !== undefined &&
          parsed.taskCreatedAt === taskCreatedAt)
      ) {
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
  taskId: string | undefined,
  option: PinnedFolderOption | null,
) => {
  if (!taskId) return
  try {
    if (option) {
      sessionStorage.setItem(
        `${CONFIRM_PINNED_OPTION_STORAGE_KEY}_${taskId}`,
        JSON.stringify({ ...option, taskId }),
      )
    } else {
      sessionStorage.setItem(
        `${CONFIRM_PINNED_OPTION_STORAGE_KEY}_${taskId}`,
        JSON.stringify({ taskId }),
      )
    }
  } catch {
    // 忽略异常
  }
}

/**
 * 读取当前整理任务固化的分类排序列表。
 * 以 taskId 作为存储键的后缀，读取时兼容旧版创建时间键，确保：
 * 1. 同一个任务内多次打开弹窗或刷新页面时，始终复用已固化的分类先后顺序；
 * 2. 任务清空并创建新任务后，因 taskId 变更而自动使用全新的分类顺序，互不干扰。
 */
export const getSavedCategoryOrder = (
  taskId?: string,
  taskCreatedAt?: number,
): string[] => {
  try {
    const key = taskId
      ? `${CONFIRM_CATEGORY_ORDER_STORAGE_PREFIX}_${taskId}`
      : CONFIRM_CATEGORY_ORDER_STORAGE_PREFIX
    const legacyKey = taskCreatedAt
      ? `${CONFIRM_CATEGORY_ORDER_STORAGE_PREFIX}_${taskCreatedAt}`
      : CONFIRM_CATEGORY_ORDER_STORAGE_PREFIX
    const raw = localStorage.getItem(key) ?? localStorage.getItem(legacyKey)
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
  taskId: string | undefined,
  order: string[],
) => {
  try {
    const key = taskId
      ? `${CONFIRM_CATEGORY_ORDER_STORAGE_PREFIX}_${taskId}`
      : CONFIRM_CATEGORY_ORDER_STORAGE_PREFIX
    localStorage.setItem(key, JSON.stringify(order))
  } catch {
    // 忽略写入异常
  }
}
