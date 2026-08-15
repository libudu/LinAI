import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { settingsRegistry } from '../../common/settings/registry'
// 注册所有设置资源（副作用）
import '../../common/settings/resources'

/**
 * 注册式设置接口（§7.3）：GET 读取完整值（本地应用，密钥明文回传方便复制），
 * PUT 整体替换。具体字段只在各模块 settings.ts 的注册定义中出现一次。
 * 错误统一抛 StorageError/ZodError，由全局 onError 映射状态码。
 */
const settingsApi = new Hono()
  .get('/:id', async (c) => {
    const snapshot = await settingsRegistry.get(c.req.param('id'))
    return c.json({
      success: true as const,
      revision: snapshot.revision,
      data: snapshot.value,
    })
  })
  .put(
    '/:id',
    zValidator(
      'json',
      z.object({
        value: z.unknown(),
        expectedRevision: z.number().int().min(0).optional(),
      }),
    ),
    async (c) => {
      const { value, expectedRevision } = c.req.valid('json')
      const snapshot = await settingsRegistry.put(
        c.req.param('id'),
        value,
        expectedRevision,
      )
      return c.json({
        success: true as const,
        revision: snapshot.revision,
        data: snapshot.value,
      })
    },
  )

export default settingsApi
