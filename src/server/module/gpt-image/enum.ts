export const GPT_IMAGE_SOURCE_MODEL = 'gpt-image-2'

// 尺寸/质量档位定义已移至 @/shared/image/params（common/task 等共用），此处再导出保持既有引用不变
export type { GptImageQuality, GptImageSize } from '@/shared/image/params'

export const GPT_IMAGE_OUTPUT_MAX_N = 8

// 特殊适配服务商的主机名
// 注意：此文件同时被前端引用（client/pages/common/GenImage/SettingModal/Endpoint），保持纯 TS、不引入 Node 依赖
export const VENICE_API_HOST = 'api.venice.ai'
export const DRAGON_API_HOST = 'dragon3api.com'

/** 判断 baseUrl 的主机名是否为指定服务商 */
export function isGptImageEndpointHost(
  url: string | undefined,
  host: string,
): boolean {
  try {
    return !!url && new URL(url).hostname === host
  } catch {
    return false
  }
}

/** Venice 特殊适配接入点：走 Venice 原生接口（见 venice.ts） */
export const isVeniceEndpoint = (url?: string): boolean =>
  isGptImageEndpointHost(url, VENICE_API_HOST)

/** DragonAPI 特殊适配接入点：按分辨率档位切换模型 id（见 generate.ts） */
export const isDragonEndpoint = (url?: string): boolean =>
  isGptImageEndpointHost(url, DRAGON_API_HOST)
