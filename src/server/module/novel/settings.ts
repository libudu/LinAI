import { z } from 'zod'
import {
  asLegacyRecord,
  settingsRegistry,
} from '../../common/settings/registry'
import { dataPath } from '../../common/storage/data-path'

// 小说模块（DeepSeek，OpenAI 兼容）设置：注册式存储，落盘 data/novels/config.json
export const novelSettingsSchema = z.object({
  novelApiKey: z.string().nullable(),
  novelBaseUrl: z.string().nullable(),
  novelModelId: z.string().nullable(),
})

export type NovelSettings = z.infer<typeof novelSettingsSchema>

const DEFAULT_NOVEL_SETTINGS: NovelSettings = {
  novelApiKey: '',
  novelBaseUrl: 'https://api.deepseek.com',
  novelModelId: 'deepseek-chat',
}

// 旧版扁平 config.json（无信封）→ value
const migrateLegacy = (raw: unknown): NovelSettings =>
  asLegacyRecord(raw) as NovelSettings

settingsRegistry.register<NovelSettings>('novel', {
  file: dataPath('novels', 'config.json'),
  defaults: DEFAULT_NOVEL_SETTINGS,
  schema: novelSettingsSchema,
  migrateLegacy,
})

/** 服务端内部读取（合并默认值） */
export const getNovelSettings = async (): Promise<NovelSettings> =>
  (await settingsRegistry.get<NovelSettings>('novel')).value

// 获取小说模块接入点，未配置时回退到默认值
export const getNovelEndpoint = async () => {
  const settings = await getNovelSettings()
  const apiKey = settings.novelApiKey || ''
  const baseUrl = settings.novelBaseUrl || DEFAULT_NOVEL_SETTINGS.novelBaseUrl!
  const modelId = settings.novelModelId || DEFAULT_NOVEL_SETTINGS.novelModelId!
  return { apiKey, baseUrl, modelId }
}
