import path from 'path'
import { ConfigJson } from '../../common/config/config-json'

// TTS 模块（Inworld）配置：独立存储在 data/tts/config.json
export interface TTSConfig {
  ttsInworldApiKey: string | null
}

const DEFAULT_TTS_CONFIG: TTSConfig = {
  ttsInworldApiKey: null,
}

const ttsConfigJson = new ConfigJson<TTSConfig>({
  dir: path.join(process.cwd(), 'data', 'tts'),
  defaults: DEFAULT_TTS_CONFIG,
})

export const getTTSConfig = ttsConfigJson.get

export const updateTTSConfig = ttsConfigJson.update

export const getTTSInworldApiKey = (): string | null => {
  return ttsConfigJson.get().ttsInworldApiKey || null
}
