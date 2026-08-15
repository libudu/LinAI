import {
  CustomEndpoint,
  ENDPOINT_PRESET_INFOS,
} from '@/shared/gpt-image/endpoints'
import fs from 'fs'
import path from 'path'
import { ConfigJson } from '../../common/config/config-json'
import { decryptApiKey } from './encrypt'

// GPT 图像模块配置：独立存储在 data/images/config.json
export interface GptImageConfig {
  gptImageApiKey: string | null
  gptImageBaseUrl: string | null
  gptImageModelId: string | null
  gptImageCustomEndpoints: CustomEndpoint[]
  /** 预设接入点各自的 API Key，按预设 label 存储 */
  gptImagePresetApiKeys: Record<string, string>
}

// 默认接入点取预设列表的第一项
const DEFAULT_ENDPOINT = ENDPOINT_PRESET_INFOS[0]

const DEFAULT_GPT_IMAGE_CONFIG: GptImageConfig = {
  gptImageApiKey: null,
  gptImageBaseUrl: DEFAULT_ENDPOINT.baseUrl,
  gptImageModelId: DEFAULT_ENDPOINT.modelId,
  gptImageCustomEndpoints: [],
  gptImagePresetApiKeys: {},
}

const GPT_IMAGE_DIR = path.join(process.cwd(), 'data', 'images')

// 旧版本配置保存在通用 data/config.json，首次启动时迁移为模块独立配置
const LEGACY_CONFIG_FILE = path.join(process.cwd(), 'data', 'config.json')
const loadLegacyConfig = (): Partial<GptImageConfig> => {
  try {
    if (fs.existsSync(path.join(GPT_IMAGE_DIR, 'config.json'))) return {}
    if (!fs.existsSync(LEGACY_CONFIG_FILE)) return {}
    const legacy = JSON.parse(fs.readFileSync(LEGACY_CONFIG_FILE, 'utf-8'))
    const picked: Partial<GptImageConfig> = {}
    for (const key of Object.keys(
      DEFAULT_GPT_IMAGE_CONFIG,
    ) as (keyof GptImageConfig)[]) {
      if (legacy[key] !== undefined) {
        ;(picked as Record<string, unknown>)[key] = legacy[key]
      }
    }
    return picked
  } catch (error) {
    console.error('[GPT图像] 迁移旧配置失败', error)
    return {}
  }
}

const gptImageConfigJson = new ConfigJson<GptImageConfig>({
  dir: GPT_IMAGE_DIR,
  defaults: { ...DEFAULT_GPT_IMAGE_CONFIG, ...loadLegacyConfig() },
})

export const getGptImageConfig = gptImageConfigJson.get

export const updateGptImageConfig = gptImageConfigJson.update

export const getYunwuApiKey = (): string | null => {
  return decryptApiKey(gptImageConfigJson.get().gptImageApiKey || '')
}

// 获取 GPT 图像接入点，未配置时回退到默认值
export const getGptImageEndpoint = () => {
  const config = gptImageConfigJson.get()
  const baseUrl =
    config.gptImageBaseUrl || DEFAULT_GPT_IMAGE_CONFIG.gptImageBaseUrl!
  const modelId =
    config.gptImageModelId || DEFAULT_GPT_IMAGE_CONFIG.gptImageModelId!
  return { baseUrl, modelId }
}
