import { zValidator } from '@hono/zod-validator'
import type { Context } from 'hono'
import { z } from 'zod'

/** 校验错误交由全局 ZodError 处理，避免插件默认响应与业务信封不一致。 */
export const validate = <T extends z.ZodType, Target extends 'json' | 'query'>(
  target: Target,
  schema: T,
) =>
  zValidator(target, schema, (result) => {
    if (!result.success) throw result.error
  })

export const errorResponse = (
  c: Context,
  status: 400 | 404 | 409 | 500,
  message: string,
) =>
  c.json(
    {
      success: false as const,
      error: {
        code:
          status === 404
            ? 'NOT_FOUND'
            : status === 409
              ? 'CONFLICT'
              : status === 400
                ? 'INVALID_REQUEST'
                : 'INTERNAL_ERROR',
        message,
      },
    },
    status,
  )

export const actionResponse = (
  c: Context,
  result:
    | { ok: true }
    | { ok: false; status: 400 | 404 | 409 | 500; error: string },
) =>
  result.ok
    ? c.json({ success: true as const, data: null })
    : errorResponse(c, result.status, result.error)
