import { isValidComfyBaseUrl } from '@/shared/gpt-image/comfyui'
import {
  ENDPOINT_PRESET_INFOS,
  findPresetById,
  findPresetEndpoint,
  inferLegacyQuotaProvider,
  isVeniceEndpoint,
  resolveImageEndpoint,
  resolvePresetApiKey,
} from '@/shared/gpt-image/endpoints'
import { z } from 'zod'
import {
  asLegacyRecord,
  settingsRegistry,
} from '../../common/settings/registry'
import { dataPath } from '../../common/storage/data-path'
import { readJsonFile } from '../../common/storage/json-file'
import { decryptApiKey } from './encrypt'

const endpointFields = z.object({
  gptImageEndpointId: z.string().min(1),
  gptImageCustomEndpoints: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string(),
      protocol: z.enum(['openai', 'venice']),
      quotaProvider: z.enum(['none', 'new-api', 'venice']),
      baseUrl: z.string(),
      modelId: z.string(),
      apiKey: z.string().optional(),
    }),
  ),
  gptImagePresetApiKeys: z.record(z.string(), z.string()),
  gptImageComfyEndpoints: z.array(
    z.object({
      id: z.string().uuid(),
      protocol: z.literal('comfyui'),
      title: z.string().trim().min(1),
      baseUrl: z
        .string()
        .refine(isValidComfyBaseUrl, 'ComfyUI 地址仅允许本机 HTTP 回环地址'),
      workflowId: z.string().uuid(),
      workflowName: z.string().min(1),
    }),
  ),
})

/** 旧平铺字段、展示名称 ID、按名称保存的 key 仅在这里兼容。 */
function migrateSettings(raw: unknown): unknown {
  const value = raw === undefined ? {} : asLegacyRecord(raw)
  const custom: Record<string, unknown>[] = Array.isArray(
    value.gptImageCustomEndpoints,
  )
    ? value.gptImageCustomEndpoints.map((item) => {
        const endpoint = asLegacyRecord(item)
        return {
          ...endpoint,
          quotaProvider:
            endpoint.quotaProvider ??
            inferLegacyQuotaProvider(String(endpoint.baseUrl || '')),
          protocol:
            endpoint.protocol ??
            (isVeniceEndpoint(String(endpoint.baseUrl || ''))
              ? 'venice'
              : 'openai'),
        }
      })
    : []
  const keys =
    value.gptImagePresetApiKeys &&
    typeof value.gptImagePresetApiKeys === 'object'
      ? ({ ...value.gptImagePresetApiKeys } as Record<string, string>)
      : {}
  let selectedId =
    typeof value.gptImageEndpointId === 'string' && value.gptImageEndpointId
      ? value.gptImageEndpointId
      : undefined
  let hasLegacySelection = !!selectedId
  if (selectedId?.startsWith('preset:')) {
    const preset = findPresetById(selectedId.slice(7))
    if (preset) selectedId = `preset:${preset.id}`
  }
  if (!selectedId) {
    const preset = findPresetEndpoint(
      value.gptImageBaseUrl as string | null,
      value.gptImageModelId as string | null,
    )
    const matchedCustom = custom.find(
      (item) =>
        item.baseUrl === value.gptImageBaseUrl &&
        item.modelId === value.gptImageModelId,
    )
    hasLegacySelection = !!preset || !!matchedCustom
    selectedId = preset
      ? `preset:${preset.id}`
      : matchedCustom
        ? `custom:${matchedCustom.id}`
        : `preset:${ENDPOINT_PRESET_INFOS[0].id}`
  }

  // 原平铺密钥只迁移给原接入点，不向其他接入点回退。
  const legacyKey =
    typeof value.gptImageApiKey === 'string' ? value.gptImageApiKey : undefined
  for (const preset of ENDPOINT_PRESET_INFOS) {
    const key = resolvePresetApiKey(preset, keys)
    if (key) keys[preset.id] = key
    if (
      legacyKey &&
      hasLegacySelection &&
      selectedId === `preset:${preset.id}` &&
      !keys[preset.id]
    )
      keys[preset.id] = legacyKey
    for (const label of [preset.label, ...(preset.legacyLabels || [])])
      delete keys[label]
  }
  for (const endpoint of custom) {
    if (legacyKey && selectedId === `custom:${endpoint.id}` && !endpoint.apiKey)
      endpoint.apiKey = legacyKey
  }
  // 无法识别旧接入点时保留旧 key，但不会把它注入默认服务商。
  if (legacyKey && !hasLegacySelection) keys['legacy:unresolved'] = legacyKey
  return {
    gptImageEndpointId: selectedId,
    gptImageCustomEndpoints: custom,
    gptImagePresetApiKeys: keys,
    gptImageComfyEndpoints: value.gptImageComfyEndpoints ?? [],
  }
}

export const gptImageSettingsSchema = z.preprocess(
  migrateSettings,
  endpointFields,
)
const writableSettingsSchema = gptImageSettingsSchema.superRefine(
  (value, ctx) => {
    if (!resolveImageEndpoint(value))
      ctx.addIssue({
        code: 'custom',
        path: ['gptImageEndpointId'],
        message: '所选生图接入点不存在，请重新选择',
      })
    const ids = [
      ...value.gptImageCustomEndpoints,
      ...value.gptImageComfyEndpoints,
    ].map((item) => item.id)
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: 'custom',
        message: '生图接入点 ID 不能重复',
      })
  },
)

export type GptImageSettings = z.infer<typeof gptImageSettingsSchema>

settingsRegistry.register<GptImageSettings>('gpt-image', {
  file: dataPath('images', 'config.json'),
  defaults: gptImageSettingsSchema.parse(undefined),
  schema: writableSettingsSchema,
  migrateLegacy: (raw) => gptImageSettingsSchema.parse(raw),
  loadLegacy: async () => {
    const legacy = await readJsonFile<unknown>(dataPath('config.json'))
    return gptImageSettingsSchema.parse(legacy)
  },
  normalize: (raw) => gptImageSettingsSchema.parse(raw),
})

export const getGptImageSettings = async (): Promise<GptImageSettings> =>
  (await settingsRegistry.get<GptImageSettings>('gpt-image')).value

export const resolveComfyEndpoint = (
  settings: GptImageSettings,
  id?: string | null,
) => {
  const endpoint = resolveImageEndpoint(
    settings,
    id ?? settings.gptImageEndpointId,
  )
  if (!endpoint || endpoint.protocol !== 'comfyui')
    throw new Error('ComfyUI 接入点已删除或未配置')
  return endpoint
}

export const getComfyEndpoint = async (id?: string | null) =>
  resolveComfyEndpoint(await getGptImageSettings(), id)

export const resolveGptImageConnection = (settings: GptImageSettings) => {
  const endpoint = resolveImageEndpoint(settings)
  if (!endpoint || endpoint.protocol === 'comfyui')
    throw new Error('云端接入点已删除或未配置')
  return { ...endpoint, apiKey: decryptApiKey(endpoint.apiKey || '') }
}
