import {
  ORGANIZE_CONCURRENCY_DEFAULT,
  ORGANIZE_CONCURRENCY_MAX,
  ORGANIZE_CONCURRENCY_MIN,
} from '@/shared/eagle/organize'
import { z } from 'zod'

/** Eagle 请求参数的唯一校验定义；前端从 Hono RPC 推导输入。 */
export const eagleScopeSchema = z.object({
  folderId: z.string().min(1).optional(),
  sortBy: z.enum(['mtime', 'size']).default('mtime'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
})

export const taskIdentitySchema = z.object({ taskId: z.string().min(1) })

export const organizeCreateTaskSchema = eagleScopeSchema.extend({
  expectedTaskId: z.string().min(1).nullable(),
  count: z.number().int().min(1),
  compress: z.boolean(),
  concurrency: z
    .number()
    .int()
    .min(ORGANIZE_CONCURRENCY_MIN)
    .max(ORGANIZE_CONCURRENCY_MAX)
    .default(ORGANIZE_CONCURRENCY_DEFAULT),
})

export const organizeAppendTaskSchema = eagleScopeSchema.extend({
  taskId: taskIdentitySchema.shape.taskId,
  count: z.number().int().min(1),
})

export const organizeConfirmItemSchema = z.object({
  itemId: z.string().min(1),
  folderPath: z.string().min(1),
  folderId: z.string().optional(),
  withTitle: z.boolean(),
})
