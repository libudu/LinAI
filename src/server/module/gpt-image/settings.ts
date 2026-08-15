import {
  ENDPOINT_PRESET_INFOS,
  resolveGptImageApiKey,
} from '@/shared/gpt-image/endpoints'
import { z } from 'zod'
import { settingsRegistry } from '../../common/settings/registry'
import { dataPath } from '../../common/storage/data-path'
import { readJsonFile } from '../../common/storage/json-file'
import { decryptApiKey } from './encrypt'

// GPT 图像模块设置：注册式存储（DocumentStore 信封），落盘 data/images/config.json。
// 字段唯一定义在下方 schema，接口层（/api/settings/gpt-image）不再重复
export const gptImageSettingsSchema = z.object({
  gptImageApiKey: z.string().nullable(),
  gptImageBaseUrl: z.string().nullable(),
  gptImageModelId: z.string().nullable(),
  gptImageCustomEndpoints: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      baseUrl: z.string(),
      modelId: z.string(),
      apiKey: z.string().optional(),
    }),
  ),
  /** 预设接入点各自的 API Key，按预设 label 存储 */
  gptImagePresetApiKeys: z.record(z.string(), z.string()),
})

export type GptImageSettings = z.infer<typeof gptImageSettingsSchema>

// 默认接入点取预设列表的第一项
const DEFAULT_ENDPOINT = ENDPOINT_PRESET_INFOS[0]

const DEFAULT_GPT_IMAGE_SETTINGS: GptImageSettings = {
  gptImageApiKey: null,
  gptImageBaseUrl: DEFAULT_ENDPOINT.baseUrl,
  gptImageModelId: DEFAULT_ENDPOINT.modelId,
  gptImageCustomEndpoints: [],
  gptImagePresetApiKeys: {},
}

const KNOWN_KEYS = Object.keys(
  DEFAULT_GPT_IMAGE_SETTINGS,
) as (keyof GptImageSettings)[]

// 旧版扁平 config.json（无信封）→ value，只挑已知字段
const migrateLegacy = (raw: unknown): GptImageSettings => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('旧配置文件不是对象')
  }
  const record = raw as Record<string, unknown>
  const picked: Record<string, unknown> = {}
  for (const key of KNOWN_KEYS) {
    if (record[key] !== undefined) picked[key] = record[key]
  }
  return picked as unknown as GptImageSettings
}

// 更旧的全局 data/config.json：仅在本模块文件完全不存在时兜底挑字段
const LEGACY_GLOBAL_CONFIG_FILE = dataPath('config.json')
const loadLegacy = async (): Promise<Partial<GptImageSettings>> => {
  try {
    const legacy = await readJsonFile<Record<string, unknown>>(
      LEGACY_GLOBAL_CONFIG_FILE,
    )
    if (!legacy) return {}
    const picked: Record<string, unknown> = {}
    for (const key of KNOWN_KEYS) {
      if (legacy[key] !== undefined) picked[key] = legacy[key]
    }
    return picked as Partial<GptImageSettings>
  } catch (error) {
    console.error('[GPT图像] 迁移旧配置失败', error)
    return {}
  }
}

settingsRegistry.register<GptImageSettings>('gpt-image', {
  file: dataPath('images', 'config.json'),
  defaults: DEFAULT_GPT_IMAGE_SETTINGS,
  schema: gptImageSettingsSchema,
  migrateLegacy,
  loadLegacy,
})

/** 服务端内部读取（合并默认值） */
export const getGptImageSettings = async (): Promise<GptImageSettings> =>
  (await settingsRegistry.get<GptImageSettings>('gpt-image')).value

export const getYunwuApiKey = async (): Promise<string | null> => {
  // 按当前接入点解析生效的密钥（预设/自定义 keychain 优先，旧平铺字段兜底）
  return decryptApiKey(resolveGptImageApiKey(await getGptImageSettings()) || '')
}

// 获取 GPT 图像接入点，未配置时回退到默认值
export const getGptImageEndpoint = async () => {
  const settings = await getGptImageSettings()
  const baseUrl =
    settings.gptImageBaseUrl || DEFAULT_GPT_IMAGE_SETTINGS.gptImageBaseUrl!
  const modelId =
    settings.gptImageModelId || DEFAULT_GPT_IMAGE_SETTINGS.gptImageModelId!
  return { baseUrl, modelId }
}
