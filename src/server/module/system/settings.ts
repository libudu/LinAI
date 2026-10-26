import { z } from 'zod'
import { settingsRegistry } from '../../common/settings/registry'
import { dataPath } from '../../common/storage/data-path'

export const systemSettingsSchema = z.object({
  loginCode: z.string().regex(/^(\d{6})?$/, '登录验证码必须是六位数字或留空'),
})
export type SystemSettings = z.infer<typeof systemSettingsSchema>

settingsRegistry.register<SystemSettings>('system', {
  file: dataPath('system', 'settings.json'),
  // 未配置或清空验证码时只允许 localhost；非空验证码必须为六位数字。
  defaults: { loginCode: '' },
  schema: systemSettingsSchema,
})

export const getSystemSettings = async () =>
  (await settingsRegistry.get<SystemSettings>('system')).value
