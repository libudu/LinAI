// 预设接入点
// 注意：此文件同时被服务端引用（src/server/common/config），不要引入前端依赖

/** size 参数形式：resolution = 具体尺寸（如 1024x1024），level = 档位（1k/2k/4k） */
export type GptImageSizeFormat = 'resolution' | 'level'

export interface EndpointPreset {
  /** 展示名称，同时作为预设的唯一标识（下拉值与预设 API Key 的存储键），各预设必须不同 */
  label: string
  baseUrl: string
  modelId: string
  /** 补充说明，选中该接入点时展示在界面上 */
  remark?: string
  /** size 参数形式，缺省为 resolution（具体尺寸） */
  sizeFormat?: GptImageSizeFormat
}

// 用户保存的自定义接入点（持久化在服务端 config.json）
export interface CustomEndpoint {
  id: string
  /** 展示名称 */
  title: string
  baseUrl: string
  modelId: string
  /** 该接入点对应的 API Key（旧数据可能缺失） */
  apiKey?: string
}

export const ENDPOINT_PRESETS: EndpointPreset[] = [
  {
    label: 'DragonAPI',
    baseUrl: 'https://newapi.dragon3api.com/v1',
    modelId: 'gpt-image-2',
    sizeFormat: 'level',
    remark: '无论1k、2k、4k，均固定计费 0.0231r 一张，不支持高画质',
  },
  {
    label: '云雾 gpt-image-2',
    baseUrl: 'https://yunwu.ai/v1',
    modelId: 'gpt-image-2',
    remark: '截止 26-08-01 以前，除了8倍优质官转分组外其他均不可用',
  },
]
