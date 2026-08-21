import { z } from 'zod'
import {
  asLegacyRecord,
  settingsRegistry,
} from '../../common/settings/registry'
import { dataPath } from '../../common/storage/data-path'

// Eagle 图片管理模块设置：注册式存储，落盘 data/eagle/config.json
export const eagleSettingsSchema = z.object({
  /** Eagle 资源库（.library 目录）的绝对路径 */
  libraryPath: z.string().nullable(),
})

export type EagleSettings = z.infer<typeof eagleSettingsSchema>

const DEFAULT_EAGLE_SETTINGS: EagleSettings = {
  libraryPath: null,
}

// 旧版扁平 config.json（无信封）→ value
const migrateLegacy = (raw: unknown): EagleSettings =>
  asLegacyRecord(raw) as EagleSettings

settingsRegistry.register<EagleSettings>('eagle', {
  file: dataPath('eagle', 'config.json'),
  defaults: DEFAULT_EAGLE_SETTINGS,
  schema: eagleSettingsSchema,
  migrateLegacy,
})

/** 服务端内部读取（合并默认值） */
export const getEagleSettings = async (): Promise<EagleSettings> =>
  (await settingsRegistry.get<EagleSettings>('eagle')).value
