// GPT 图像接入点定义（无 UI 依赖，前后端共享）
// 前端 UI 层的 remark 富文本说明在 client 侧按 label 合并，见
// src/client/pages/common/GenImage/SettingModal/Endpoint/endpointPresets.tsx

/** size 参数形式：resolution = 具体尺寸（如 1024x1024），level = 档位（1k/2k/4k） */
export type GptImageSizeFormat = 'resolution' | 'level'

/** 预设接入点的基础信息（不含 UI 说明） */
export interface EndpointPresetInfo {
  /** 展示名称，同时作为预设的唯一标识（下拉值与预设 API Key 的存储键），各预设必须不同 */
  label: string
  baseUrl: string
  modelId: string
  /** 积分比例：平台 1 元对应充值积分的倍数，余额展示时按此比例换算（不填默认 1，自定义接入点固定为 1） */
  creditRatio?: number
  /** 余额展示的货币单位（不填默认 ￥，自定义接入点固定为 ￥） */
  currency?: string
}

// 用户保存的自定义接入点（持久化在服务端 data/images/config.json）
export interface CustomEndpoint {
  id: string
  /** 展示名称 */
  title: string
  baseUrl: string
  modelId: string
  /** 该接入点对应的 API Key（旧数据可能缺失） */
  apiKey?: string
}

export const ENDPOINT_PRESET_INFOS: EndpointPresetInfo[] = [
  {
    label: '云雾 gpt-image-2-c',
    baseUrl: 'https://api.oljjio.xyz/v1',
    modelId: 'gpt-image-2-c',
    creditRatio: 2,
  },
  {
    label: '云雾 gpt-image-2',
    baseUrl: 'https://api.oljjio.xyz/v1',
    modelId: 'gpt-image-2',
    creditRatio: 2,
  },
  {
    label: 'DragonAPI gpt-image-2',
    baseUrl: 'https://dragon3api.com/v1',
    modelId: 'gpt-image-2',
  },
  {
    label: 'Venice qwen-image-3-edit',
    baseUrl: 'https://api.venice.ai',
    modelId: 'qwen-image-3-edit',
    currency: '$',
  },
]
