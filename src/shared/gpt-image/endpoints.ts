import {
  GPT_IMAGE_OUTPUT_MAX_N,
  type GptImageQuality,
  type GptImageSize,
} from '@/shared/image/params'

export type GptImageSizeFormat = 'resolution' | 'level'
export type CloudImageProtocol = 'openai' | 'venice'
export type QuotaProvider = 'none' | 'new-api' | 'venice'
export type ImageProtocol = CloudImageProtocol | 'comfyui'

export interface EndpointPresetInfo {
  /** 稳定 ID，不随展示名称或模型升级改变 */
  id: string
  label: string
  protocol: CloudImageProtocol
  quotaProvider?: QuotaProvider
  baseUrl: string
  modelId: string
  legacyModelIds?: string[]
  legacyLabels?: string[]
  creditRatio?: number
  currency?: string
}

export interface CustomEndpoint {
  id: string
  title: string
  protocol: CloudImageProtocol
  quotaProvider?: QuotaProvider
  baseUrl: string
  modelId: string
  apiKey?: string
}

export interface ComfyEndpoint {
  id: string
  protocol: 'comfyui'
  title: string
  baseUrl: string
  workflowId: string
  workflowName: string
}

export const ENDPOINT_PRESET_INFOS: EndpointPresetInfo[] = [
  {
    id: 'openlux-sunburst',
    quotaProvider: 'new-api',
    label: 'openlux gpt-image-2.5-sunburst-c',
    protocol: 'openai',
    baseUrl: 'https://api.openlux.ai/v1',
    modelId: 'gpt-image-2.5-sunburst-c',
    legacyModelIds: ['gpt-image-2-c', 'gpt-image-2'],
    legacyLabels: ['openlux gpt-image-2-c', 'openlux gpt-image-2'],
    currency: '$',
  },
  {
    id: 'dragonapi-sunburst',
    quotaProvider: 'new-api',
    label: 'DragonAPI gpt-image-2.5-sunburst',
    protocol: 'openai',
    baseUrl: 'https://dragon3api.com/v1',
    modelId: 'gpt-image-2.5-sunburst',
    legacyModelIds: ['gpt-image-2'],
    legacyLabels: ['DragonAPI gpt-image-2', 'DragonAPI'],
  },
  {
    id: 'venice-qwen-image',
    quotaProvider: 'venice',
    label: 'Venice qwen-image-3-edit',
    protocol: 'venice',
    baseUrl: 'https://api.venice.ai',
    modelId: 'qwen-image-3-edit',
    currency: '$',
  },
]

/** 仅迁移旧配置时按地址、模型和历史名称识别预设。 */
export const findPresetEndpoint = (
  baseUrl: string | null | undefined,
  modelId: string | null | undefined,
) =>
  ENDPOINT_PRESET_INFOS.find(
    (p) => p.baseUrl === baseUrl && p.modelId === modelId,
  ) ??
  ENDPOINT_PRESET_INFOS.find(
    (p) => p.baseUrl === baseUrl && p.legacyModelIds?.includes(modelId || ''),
  )

export const findPresetById = (id: string) =>
  ENDPOINT_PRESET_INFOS.find(
    (p) => p.id === id || p.label === id || p.legacyLabels?.includes(id),
  )

export const resolvePresetApiKey = (
  preset: EndpointPresetInfo,
  keys: Record<string, string>,
) => {
  for (const key of [preset.id, preset.label, ...(preset.legacyLabels || [])]) {
    if (keys[key]) return keys[key]
  }
  return undefined
}

export interface GptImageEndpointSettings {
  gptImageEndpointId: string
  gptImageCustomEndpoints: CustomEndpoint[]
  gptImagePresetApiKeys: Record<string, string>
  gptImageComfyEndpoints: ComfyEndpoint[]
}

export type ResolvedImageEndpoint =
  | (CustomEndpoint & {
      selectionId: string
      currency?: string
      creditRatio?: number
    })
  | (ComfyEndpoint & { selectionId: string })

/** 地址、协议、模型、密钥始终来自同一个 ID，失效时不猜测其他接入点。 */
export function resolveImageEndpoint(
  settings: GptImageEndpointSettings,
  selectionId = settings.gptImageEndpointId,
): ResolvedImageEndpoint | undefined {
  if (selectionId.startsWith('preset:')) {
    const preset = ENDPOINT_PRESET_INFOS.find(
      (p) => `preset:${p.id}` === selectionId,
    )
    if (!preset) return undefined
    return {
      ...preset,
      selectionId,
      title: preset.label,
      apiKey: resolvePresetApiKey(preset, settings.gptImagePresetApiKeys),
    }
  }
  if (selectionId.startsWith('custom:')) {
    const endpoint = settings.gptImageCustomEndpoints.find(
      (item) => `custom:${item.id}` === selectionId,
    )
    return endpoint ? { ...endpoint, selectionId } : undefined
  }
  const endpoint = settings.gptImageComfyEndpoints.find(
    (item) => item.id === selectionId,
  )
  return endpoint ? { ...endpoint, selectionId } : undefined
}

export const resolveGptImageApiKey = (settings: GptImageEndpointSettings) => {
  const endpoint = resolveImageEndpoint(settings)
  return endpoint && endpoint.protocol !== 'comfyui'
    ? endpoint.apiKey || null
    : null
}

/** 旧配置仅按已知服务商地址兼容；未知 OpenAI 接入点不会猜测余额 API。 */
export function inferLegacyQuotaProvider(baseUrl?: string): QuotaProvider {
  try {
    const host = new URL(baseUrl || '').hostname
    if (host === 'api.venice.ai') return 'venice'
    if (
      ['api.openlux.ai', 'dragon3api.com', 'yunwu.ai', 'api.yunwu.ai'].includes(
        host,
      )
    )
      return 'new-api'
  } catch {
    /* 无效地址由提交校验处理 */
  }
  return 'none'
}

export const getQuotaProvider = (endpoint: {
  protocol: ImageProtocol
  quotaProvider?: QuotaProvider
}) =>
  endpoint.protocol === 'comfyui' ? 'none' : (endpoint.quotaProvider ?? 'none')

export interface ImageEndpointCapabilities {
  minImages: number
  maxImages: number
  maxOutputs: number
  sizes: readonly GptImageSize[]
  qualities: readonly GptImageQuality[]
  aspectRatio: boolean
  appendAspectRatio: boolean
  quota: boolean
  /** 是否能保证取消远端执行；云端只能中断本地等待。 */
  cancel: boolean
}

/** 协议能力集中声明；参考图编辑与文生图的张数限制可能不同。 */
export function getImageEndpointCapabilities(
  endpoint: {
    protocol: ImageProtocol
    modelId?: string
    quotaProvider?: QuotaProvider
  },
  imageCount = 0,
): ImageEndpointCapabilities {
  if (endpoint.protocol === 'comfyui')
    return {
      minImages: 1,
      maxImages: 1,
      maxOutputs: 1,
      sizes: [],
      qualities: [],
      aspectRatio: false,
      appendAspectRatio: false,
      quota: false,
      cancel: true,
    }
  if (endpoint.protocol === 'venice')
    return {
      minImages: 0,
      maxImages: 10,
      maxOutputs: imageCount ? 1 : 4,
      sizes: ['1k', '2k'],
      qualities: ['medium', 'high'],
      aspectRatio: true,
      appendAspectRatio: true,
      quota: getQuotaProvider(endpoint) !== 'none',
      cancel: false,
    }
  return {
    minImages: 0,
    maxImages: 10,
    maxOutputs: GPT_IMAGE_OUTPUT_MAX_N,
    sizes: ['1k', '2k', '4k'],
    qualities: endpoint.modelId?.includes('gpt-image-2.5')
      ? ['medium', 'high', 'xhigh', 'max']
      : ['medium', 'high'],
    aspectRatio: true,
    appendAspectRatio: true,
    quota: getQuotaProvider(endpoint) !== 'none',
    cancel: false,
  }
}

export function validateImageEndpointInput(
  endpoint: ResolvedImageEndpoint,
  input: {
    images?: string[]
    n?: number
    size?: GptImageSize
    quality?: GptImageQuality
  },
): string | undefined {
  const count = input.images?.length || 0
  const capabilities = getImageEndpointCapabilities(endpoint, count)
  if (count < capabilities.minImages || count > capabilities.maxImages)
    return capabilities.minImages === capabilities.maxImages
      ? `当前接入点必须恰好提供 ${capabilities.minImages} 张参考图`
      : `当前接入点最多支持 ${capabilities.maxImages} 张参考图`
  if (endpoint.protocol === 'comfyui') return undefined
  if (
    !Number.isInteger(input.n ?? 1) ||
    (input.n ?? 1) < 1 ||
    (input.n ?? 1) > capabilities.maxOutputs
  )
    return `当前接入点本次生成支持 1～${capabilities.maxOutputs} 张图片`
  if (!capabilities.sizes.includes(input.size ?? '1k'))
    return '当前接入点不支持所选尺寸'
  if (!capabilities.qualities.includes(input.quality ?? 'medium'))
    return '当前接入点不支持所选画质'
  return undefined
}

export const VENICE_API_HOST = 'api.venice.ai'
export function isGptImageEndpointHost(url: string | undefined, host: string) {
  try {
    return !!url && new URL(url).hostname === host
  } catch {
    return false
  }
}
/** 仅用于旧自定义接入点迁移，不用于生成请求分流。 */
export const isVeniceEndpoint = (url?: string) =>
  isGptImageEndpointHost(url, VENICE_API_HOST)
