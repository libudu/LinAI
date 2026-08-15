import { z } from 'zod'
import { settingsRegistry } from '../../common/settings/registry'
import { dataPath } from '../../common/storage/data-path'

// TTS 模块（Inworld）设置：注册式存储，落盘 data/tts/config.json
export const ttsSettingsSchema = z.object({
  ttsInworldApiKey: z.string().nullable(),
})

export type TTSSettings = z.infer<typeof ttsSettingsSchema>

const DEFAULT_TTS_SETTINGS: TTSSettings = {
  ttsInworldApiKey: null,
}

// 旧版扁平 config.json（无信封）→ value
const migrateLegacy = (raw: unknown): TTSSettings => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('旧配置文件不是对象')
  }
  return raw as TTSSettings
}

settingsRegistry.register<TTSSettings>('tts', {
  file: dataPath('tts', 'config.json'),
  defaults: DEFAULT_TTS_SETTINGS,
  schema: ttsSettingsSchema,
  migrateLegacy,
})

export const getTTSInworldApiKey = async (): Promise<string | null> => {
  const snapshot = await settingsRegistry.get<TTSSettings>('tts')
  return snapshot.value.ttsInworldApiKey || null
}
