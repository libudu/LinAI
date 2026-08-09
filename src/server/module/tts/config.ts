import fs from 'fs'
import path from 'path'
import { ConfigJson } from '../../common/config/config-json'

// TTS 模块（Inworld）配置：独立存储在 data/tts/config.json
export interface TTSConfig {
  ttsInworldApiKey: string | null
}

const DEFAULT_TTS_CONFIG: TTSConfig = {
  ttsInworldApiKey: null,
}

const TTS_DIR = path.join(process.cwd(), 'data', 'tts')

// 旧版本的 TTS 配置存放在全局 data/config.json 中，新文件首次创建时迁移过来
const readLegacyTTSConfig = (): Partial<TTSConfig> => {
  try {
    const configFile = path.join(TTS_DIR, 'config.json')
    if (fs.existsSync(configFile)) return {}
    const legacyFile = path.join(process.cwd(), 'data', 'config.json')
    if (!fs.existsSync(legacyFile)) return {}
    const legacy = JSON.parse(fs.readFileSync(legacyFile, 'utf-8'))
    const picked: Partial<TTSConfig> = {}
    if (legacy.ttsInworldApiKey != null) {
      picked.ttsInworldApiKey = legacy.ttsInworldApiKey
    }
    return picked
  } catch {
    return {}
  }
}

const ttsConfigJson = new ConfigJson<TTSConfig>({
  dir: TTS_DIR,
  defaults: { ...DEFAULT_TTS_CONFIG, ...readLegacyTTSConfig() },
})

export const getTTSConfig = ttsConfigJson.get

export const updateTTSConfig = ttsConfigJson.update

export const getTTSInworldApiKey = (): string | null => {
  return ttsConfigJson.get().ttsInworldApiKey || null
}
