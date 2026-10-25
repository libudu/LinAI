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

/** 操作按数组顺序应用；新增操作时扩展此联合及媒体处理器。 */
export const eagleMediaEditOperationSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('rotate'),
    degrees: z.union([z.literal(90), z.literal(180), z.literal(270)]),
  }),
  z
    .strictObject({
      type: z.literal('crop'),
      // 相对于应用前序操作后画面的比例，避免预览尺寸影响输出。
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      width: z.number().positive().max(1),
      height: z.number().positive().max(1),
    })
    .refine(
      (crop) => crop.x + crop.width <= 1 && crop.y + crop.height <= 1,
      '裁剪区域超出画面',
    ),
])

export const eagleMediaEditSaveSchema = z
  .strictObject({
    contentVersion: z.string().min(1),
    operations: z.array(eagleMediaEditOperationSchema).min(1).max(32),
    saveAsCopy: z.boolean().optional(),
  })
  .refine(
    (request) =>
      request.saveAsCopy ||
      !request.operations.some((operation) => operation.type === 'crop'),
    '视频裁剪必须另存为新条目',
  )

export type EagleMediaEditOperation = z.infer<
  typeof eagleMediaEditOperationSchema
>
export type EagleMediaEditSaveRequest = z.infer<typeof eagleMediaEditSaveSchema>

/** Eagle 请求参数的唯一校验定义；前端从 Hono RPC 推导输入。 */
export const eagleScopeSchema = z.object({
  folderId: z.string().min(1).optional(),
  sortBy: z.enum(['lastModified', 'mtime', 'size']).default('mtime'),
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
  mediaType: z.enum(EAGLE_MEDIA_TYPES).default('image'),
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
  mediaType: z.enum(EAGLE_MEDIA_TYPES).default('image'),
  taskId: taskIdentitySchema.shape.taskId,
  count: z.number().int().min(1),
})

export const organizeConfirmItemSchema = z.object({
  itemId: z.string().min(1),
  folderPath: z.string().min(1),
  folderId: z.string().optional(),
  withTitle: z.boolean(),
})
