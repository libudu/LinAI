import fs from 'fs'
import path from 'path'
import { ENDPOINT_PRESETS } from '../../../client/pages/common/SettingModal/endpointPresets'
import { decryptApiKey } from '../../module/gpt-image/encrypt'

export interface Config {
  gptImageApiKey: string | null
  gptImageBaseUrl?: string | null
  gptImageModelId?: string | null
  ttsInworldApiKey?: string | null
  localNetworkUrl?: string
}

const CONFIG_DIR = path.join(process.cwd(), 'data')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

// 默认接入点取前端预设列表的第一项
const DEFAULT_ENDPOINT = ENDPOINT_PRESETS[0]

const DEFAULT_CONFIG: Config = {
  gptImageApiKey: null,
  gptImageBaseUrl: DEFAULT_ENDPOINT.baseUrl,
  gptImageModelId: DEFAULT_ENDPOINT.modelId,
  ttsInworldApiKey: null,
}

let currentConfig: Config = { ...DEFAULT_CONFIG }

// Initialize config on module load
try {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }
  if (fs.existsSync(CONFIG_FILE)) {
    const fileContent = fs.readFileSync(CONFIG_FILE, 'utf-8')
    currentConfig = { ...DEFAULT_CONFIG, ...JSON.parse(fileContent) }
  } else {
    fs.writeFileSync(
      CONFIG_FILE,
      JSON.stringify(DEFAULT_CONFIG, null, 2),
      'utf-8',
    )
  }
} catch (error) {
  console.error('Failed to initialize config:', error)
}

export const getConfig = (): Config => {
  return currentConfig
}

export const updateConfig = (newConfig: Partial<Config>): Config => {
  currentConfig = { ...currentConfig, ...newConfig }
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true })
    }
    fs.writeFileSync(
      CONFIG_FILE,
      JSON.stringify(currentConfig, null, 2),
      'utf-8',
    )
  } catch (error) {
    console.error('Failed to write config:', error)
  }
  return currentConfig
}

export const getYunwuApiKey = (): string | null => {
  return decryptApiKey(currentConfig.gptImageApiKey || '')
}

// 获取 GPT 图像接入点，未配置时回退到默认值
export const getGptImageEndpoint = (): { baseUrl: string; modelId: string } => {
  return {
    baseUrl: currentConfig.gptImageBaseUrl || DEFAULT_CONFIG.gptImageBaseUrl!,
    modelId: currentConfig.gptImageModelId || DEFAULT_CONFIG.gptImageModelId!,
  }
}

export const getTTSInworldApiKey = (): string | null => {
  return currentConfig.ttsInworldApiKey || null
}
