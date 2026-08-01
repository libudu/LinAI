// 预设接入点
// 注意：此文件同时被服务端引用（src/server/common/config），不要引入前端依赖
export interface EndpointPreset {
  label: string
  baseUrl: string
  modelId: string
  /** 补充说明，选中该接入点时展示在界面上 */
  remark?: string
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
    label: '云雾 gpt-image-2',
    baseUrl: 'https://yunwu.ai/v1',
    modelId: 'gpt-image-2',
  },
  {
    label: '云雾 gpt-image-2c',
    baseUrl: 'https://yunwu.ai/v1',
    modelId: 'gpt-image-2c',
    remark: '无论2k、4k均固定计费，0.075r 一张',
  },
]
