import {
  CustomEndpoint,
  ENDPOINT_PRESETS,
} from '@/client/pages/common/GenImage/SettingModal/Endpoint/endpointPresets'
import path from 'path'
import { decryptApiKey } from '../../module/gpt-image/encrypt'
import { ConfigJson } from './config-json'

export interface Config {
  gptImageApiKey: string | null
  gptImageBaseUrl?: string | null
  gptImageModelId?: string | null
  gptImageCustomEndpoints?: CustomEndpoint[]
  /** 预设接入点各自的 API Key，按预设 label 存储 */
  gptImagePresetApiKeys?: Record<string, string>
  localNetworkUrl?: string
}

// 默认接入点取前端预设列表的第一项
const DEFAULT_ENDPOINT = ENDPOINT_PRESETS[0]

const DEFAULT_CONFIG: Config = {
  gptImageApiKey: null,
  gptImageBaseUrl: DEFAULT_ENDPOINT.baseUrl,
  gptImageModelId: DEFAULT_ENDPOINT.modelId,
}

const configJson = new ConfigJson<Config>({
  dir: path.join(process.cwd(), 'data'),
  defaults: DEFAULT_CONFIG,
})

export const getConfig = configJson.get

export const updateConfig = configJson.update

export const getYunwuApiKey = (): string | null => {
  return decryptApiKey(configJson.get().gptImageApiKey || '')
}

// 获取 GPT 图像接入点，未配置时回退到默认值
export const getGptImageEndpoint = () => {
  const config = configJson.get()
  const baseUrl = config.gptImageBaseUrl || DEFAULT_CONFIG.gptImageBaseUrl!
  const modelId = config.gptImageModelId || DEFAULT_CONFIG.gptImageModelId!
  return { baseUrl, modelId }
}

