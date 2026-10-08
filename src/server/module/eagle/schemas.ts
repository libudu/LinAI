import {
  ORGANIZE_CLASSIFICATION_MODES,
  ORGANIZE_CONCURRENCY_DEFAULT,
  ORGANIZE_CONCURRENCY_MAX,
  ORGANIZE_CONCURRENCY_MIN,
} from '@/shared/eagle/organize'
import { EAGLE_MEDIA_TYPES } from '@/shared/eagle/types'
import { z } from 'zod'

export const eagleMediaQuerySchema = z.object({
  mediaType: z.enum(EAGLE_MEDIA_TYPES).optional(),
})

/** Eagle 请求参数的唯一校验定义；前端从 Hono RPC 推导输入。 */
export const eagleScopeSchema = z.object({
  folderId: z.string().min(1).optional(),
  sortBy: z.enum(['mtime', 'size']).default('mtime'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
})

export const eagleItemsQuerySchema = eagleScopeSchema.extend({
  mediaType: eagleMediaQuerySchema.shape.mediaType,
  keyword: z.string().trim().optional(),
  offset: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(500).default(100),
})

export const taskIdentitySchema = z.object({ taskId: z.string().min(1) })

export const organizePrepareSchema = eagleScopeSchema.extend({
  classificationMode: z.enum(ORGANIZE_CLASSIFICATION_MODES).default('global'),
})

export const organizeCreateTaskSchema = organizePrepareSchema.extend({
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
