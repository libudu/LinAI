import type {
  OrganizeCreateTaskParams as CreateTaskParams,
  OrganizeAppendTaskParams,
  OrganizePrepareParams,
  OrganizeTaskView,
} from '@/shared/eagle/organize'

export type { OrganizePrepareParams } from '@/shared/eagle/organize'
/** HTTP 校验后默认值已填充；业务服务只接收归一化参数。 */
export type OrganizeCreateTaskParams = CreateTaskParams & {
  concurrency: number
}
export type OrganizeAppendParams = OrganizeAppendTaskParams &
  OrganizePrepareParams

export type CreateTaskResult =
  | { ok: true; task: OrganizeTaskView }
  | { ok: false; status: 400 | 409; error: string }

/** 确认 / 不处理 / 重新执行 / 追加的结果动作 */
export type OrganizeActionResult =
  | { ok: true }
  | { ok: false; status: 400 | 404 | 409; error: string }
