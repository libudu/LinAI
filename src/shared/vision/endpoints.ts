// 视觉模型接入点定义（无 UI 依赖，前后端共享）

export interface VisionEndpointPresetInfo {
  label: string
  baseUrl: string
  modelId: string
}

export interface VisionCustomEndpoint {
  id: string
  title: string
  baseUrl: string
  modelId: string
  apiKey?: string
}

export interface VisionEndpointSettings {
  visionBaseUrl: string
  visionModelId: string
  visionCustomEndpoints: VisionCustomEndpoint[]
  visionPresetApiKeys: Record<string, string>
}

export const VISION_ENDPOINT_PRESET_INFOS = [
  {
    label: 'DragonAPI gpt-5.6-terra',
    baseUrl: 'https://dragon3api.com/v1',
    modelId: 'gpt-5.6-terra',
  },
] satisfies VisionEndpointPresetInfo[]

export const resolveVisionApiKey = (
  settings: VisionEndpointSettings,
): string | null => {
  const preset = VISION_ENDPOINT_PRESET_INFOS.find(
    (item) =>
      item.baseUrl === settings.visionBaseUrl &&
      item.modelId === settings.visionModelId,
  )
  if (preset) {
    const apiKey = settings.visionPresetApiKeys[preset.label]
    if (apiKey) return apiKey
  }
  const custom = settings.visionCustomEndpoints.find(
    (item) =>
      item.baseUrl === settings.visionBaseUrl &&
      item.modelId === settings.visionModelId &&
      Boolean(item.title?.trim()),
  )
  if (custom?.apiKey) return custom.apiKey
  return null
}
