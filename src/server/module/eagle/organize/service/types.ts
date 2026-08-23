import type { OrganizeTaskView } from '@/shared/eagle/organize'
import type { EagleSortBy, EagleSortOrder } from '@/shared/eagle/types'

export interface OrganizePrepareParams {
  folderId?: string
  sortBy: EagleSortBy
  sortOrder: EagleSortOrder
}

export interface OrganizeCreateTaskParams extends OrganizePrepareParams {
  count: number
  compress: boolean
  /** 队列执行并发数（1~10，创建时固化到任务） */
  concurrency: number
}

export type CreateTaskResult =
  | { ok: true; task: OrganizeTaskView }
  | { ok: false; status: 400 | 409; error: string }

/** 确认 / 不处理 / 重新执行 / 追加的结果动作 */
export type OrganizeActionResult =
  | { ok: true }
  | { ok: false; status: 400 | 404 | 409; error: string }
