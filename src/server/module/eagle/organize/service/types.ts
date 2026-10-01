import type { OrganizeTaskView } from '@/shared/eagle/organize'
import type { z } from 'zod'
import type {
  organizeAppendTaskSchema,
  organizeConfirmItemSchema,
  organizeCreateTaskSchema,
} from '../../schemas'

export type { OrganizePrepareParams } from '@/shared/eagle/organize'
/** HTTP 校验后默认值已填充；业务参数由同一 schema 推导。 */
export type OrganizeCreateTaskParams = Omit<
  z.output<typeof organizeCreateTaskSchema>,
  'expectedTaskId'
>
export type OrganizeAppendParams = Omit<
  z.output<typeof organizeAppendTaskSchema>,
  'taskId'
>
export type OrganizeConfirmItem = z.output<typeof organizeConfirmItemSchema>

export type CreateTaskResult =
  | { ok: true; task: OrganizeTaskView }
  | { ok: false; status: 400 | 409; error: string }

/** 确认 / 不处理 / 重新执行 / 追加的结果动作 */
export type OrganizeActionResult =
  | { ok: true }
  | { ok: false; status: 400 | 404 | 409 | 500; error: string }

/** 确认页删除命令保留缺失反馈，避免前端先删库再校验整理任务。 */
export type OrganizeTrashResult =
  | { ok: true; missing: boolean }
  | Extract<OrganizeActionResult, { ok: false }>
