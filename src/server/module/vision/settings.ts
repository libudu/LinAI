import {
  VISION_ENDPOINT_PRESET_INFOS,
  resolveVisionApiKey,
} from '@/shared/vision/endpoints'
import { z } from 'zod'
import { settingsRegistry } from '../../common/settings/registry'
import { dataPath } from '../../common/storage/data-path'

export const visionSettingsSchema = z.object({
  visionBaseUrl: z.string(),
  visionModelId: z.string(),
  visionCustomEndpoints: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      baseUrl: z.string(),
      modelId: z.string(),
      apiKey: z.string().optional(),
    }),
  ),
  visionPresetApiKeys: z.record(z.string(), z.string()),
})

export type VisionSettings = z.infer<typeof visionSettingsSchema>

const DEFAULT_ENDPOINT = VISION_ENDPOINT_PRESET_INFOS[0]

const DEFAULT_VISION_SETTINGS: VisionSettings = {
  visionBaseUrl: DEFAULT_ENDPOINT.baseUrl,
  visionModelId: DEFAULT_ENDPOINT.modelId,
  visionCustomEndpoints: [],
  visionPresetApiKeys: {},
}

settingsRegistry.register<VisionSettings>('vision', {
  file: dataPath('vision', 'config.json'),
  defaults: DEFAULT_VISION_SETTINGS,
  schema: visionSettingsSchema,
})

export const getVisionSettings = async (): Promise<VisionSettings> =>
  (await settingsRegistry.get<VisionSettings>('vision')).value

export const getVisionEndpoint = async () => {
  const settings = await getVisionSettings()
  const preset = VISION_ENDPOINT_PRESET_INFOS.find(
    (item) =>
      item.baseUrl === settings.visionBaseUrl &&
      item.modelId === settings.visionModelId,
  )
  const custom = settings.visionCustomEndpoints.find(
    (item) =>
      item.baseUrl === settings.visionBaseUrl &&
      item.modelId === settings.visionModelId &&
      Boolean(item.title?.trim()),
  )
  const baseUrl = preset
    ? preset.baseUrl
    : custom
      ? custom.baseUrl
      : DEFAULT_ENDPOINT.baseUrl
  const modelId = preset
    ? preset.modelId
    : custom
      ? custom.modelId
      : DEFAULT_ENDPOINT.modelId
  return {
    baseUrl,
    modelId,
    apiKey: resolveVisionApiKey(settings),
  }
}
