import type { OrganizeFolderStandard } from '@/shared/eagle/organize'
import type { EagleFolder } from '@/shared/eagle/types'
import { buildFolderMap } from '../../../folders'
import type { PinnedFolderOption } from '../types'
import {
  SPECIAL_CATEGORY_LOW_QUALITY,
  SPECIAL_CATEGORY_UNCLASSIFIED,
} from '../types'

interface CategoryContext {
  pathsById: Map<string, string>
  idsByPath: Map<string, string>
  legacyIdsByPath: Map<string, string>
}

export const createCategoryContext = (
  folders: EagleFolder[],
  standards: OrganizeFolderStandard[] = [],
): CategoryContext => {
  const entries = [...buildFolderMap(folders).values()]
  return {
    pathsById: new Map(entries.map((folder) => [folder.id, folder.path])),
    idsByPath: new Map(entries.map((folder) => [folder.path, folder.id])),
    legacyIdsByPath: new Map(
      standards.map((folder) => [folder.folderPath, folder.folderId]),
    ),
  }
}

const encodeCategory = (path: string, context?: CategoryContext) => {
  if (
    !context ||
    [SPECIAL_CATEGORY_LOW_QUALITY, SPECIAL_CATEGORY_UNCLASSIFIED].includes(path)
  )
    return path
  const folderId = context.idsByPath.get(path)
  return folderId ? { path, folderId } : path
}

/** 兼容旧路径缓存；新缓存按 ID 跟随改名与父目录移动。 */
const decodeCategory = (
  value: unknown,
  context?: CategoryContext,
): string | null => {
  const path =
    typeof value === 'string'
      ? value
      : value &&
          typeof value === 'object' &&
          'path' in value &&
          typeof value.path === 'string'
        ? value.path
        : null
  if (
    !path ||
    !context ||
    [SPECIAL_CATEGORY_LOW_QUALITY, SPECIAL_CATEGORY_UNCLASSIFIED].includes(path)
  )
    return path
  const folderId =
    value &&
    typeof value === 'object' &&
    'folderId' in value &&
    typeof value.folderId === 'string'
      ? value.folderId
      : context.legacyIdsByPath.get(path)
  return (folderId ? context.pathsById.get(folderId) : undefined) ?? path
}

export const CONFIRM_SORT_STORAGE_KEY = 'eagle_organize_confirm_sort'
export const CONFIRM_QUICK_MODE_STORAGE_KEY =
  'eagle_organize_confirm_quick_mode'
export const CONFIRM_CATEGORY_ORDER_STORAGE_PREFIX =
  'eagle_organize_category_order'
export const CONFIRM_PINNED_OPTION_STORAGE_KEY = 'eagle_organize_pinned_option'
const CONFIRM_PINNED_CATEGORY_STORAGE_KEY = 'eagle_organize_pinned_category'

/** 分堆置顶只在同一任务内复用，与确认目标文件夹的置顶独立。 */
export const getSavedPinnedCategory = (
  taskId?: string,
  context?: CategoryContext,
): string | null => {
  if (!taskId) return null
  try {
    const raw =
      sessionStorage.getItem(
        `${CONFIRM_PINNED_CATEGORY_STORAGE_KEY}_${taskId}`,
      ) ?? sessionStorage.getItem(CONFIRM_PINNED_CATEGORY_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.taskId === taskId) {
      return decodeCategory(parsed.category, context)
    }
  } catch {
    // 忽略损坏的本地缓存
  }
  return null
}

export const savePinnedCategory = (
  taskId: string,
  category: string | null,
  context?: CategoryContext,
) => {
  try {
    if (category) {
      sessionStorage.setItem(
        `${CONFIRM_PINNED_CATEGORY_STORAGE_KEY}_${taskId}`,
        JSON.stringify({ taskId, category: encodeCategory(category, context) }),
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
  context?: CategoryContext,
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
      if (Array.isArray(parsed)) {
        return parsed.flatMap((value) => {
          const path = decodeCategory(value, context)
          return path ? [path] : []
        })
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
  context?: CategoryContext,
) => {
  try {
    const key = taskId
      ? `${CONFIRM_CATEGORY_ORDER_STORAGE_PREFIX}_${taskId}`
      : CONFIRM_CATEGORY_ORDER_STORAGE_PREFIX
    localStorage.setItem(
      key,
      JSON.stringify(order.map((path) => encodeCategory(path, context))),
    )
  } catch {
    // 忽略写入异常
  }
}
