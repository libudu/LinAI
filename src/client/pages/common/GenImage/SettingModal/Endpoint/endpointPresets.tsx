// 预设接入点
// 注意：此文件同时被服务端引用（src/server/common/config），不要引入前端依赖

import { ReactNode } from 'react'

/** size 参数形式：resolution = 具体尺寸（如 1024x1024），level = 档位（1k/2k/4k） */
export type GptImageSizeFormat = 'resolution' | 'level'

export interface EndpointPreset {
  /** 展示名称，同时作为预设的唯一标识（下拉值与预设 API Key 的存储键），各预设必须不同 */
  label: string
  baseUrl: string
  modelId: string
  /** 补充说明，选中该接入点时展示在界面上 */
  remark?: ReactNode
  /** 积分比例：平台 1 元对应充值积分的倍数，余额展示时按此比例换算（不填默认 1，自定义接入点固定为 1） */
  creditRatio?: number
  /** 余额展示的货币单位（不填默认 ￥，自定义接入点固定为 ￥） */
  currency?: string
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
    label: '云雾 gpt-image-2-c',
    baseUrl: 'https://api.oljjio.xyz/v1',
    modelId: 'gpt-image-2-c',
    creditRatio: 2,
    remark: (
      <div>
        <div>
          官网：
          <a href="https://api.oljjio.xyz" target="_blank">
            https://api.oljjio.xyz/
          </a>
        </div>
        <div>无论1k、2k、4k，均固定计费 0.075r 一张</div>
        <div>需要 GPT绘图 分组</div>
      </div>
    ),
  },
  {
    label: '云雾 gpt-image-2',
    baseUrl: 'https://api.oljjio.xyz/v1',
    modelId: 'gpt-image-2',
    creditRatio: 2,
    remark: (
      <div>
        <div>
          官网：
          <a href="https://api.oljjio.xyz" target="_blank">
            https://api.oljjio.xyz/
          </a>
        </div>
        <div>截止 26-08-01 以前，除了8倍优质官转分组外其他均不可用</div>
      </div>
    ),
  },
  {
    label: 'DragonAPI gpt-image-2',
    baseUrl: 'https://dragon3api.com/v1',
    modelId: 'gpt-image-2',
    remark: (
      <div>
        <div>
          官网：
          <a href="https://dragon3api.com" target="_blank">
            https://dragon3api.com/
          </a>
        </div>
        <div>不同分辨率会使用不同模型id</div>
        <div>1k 0.1r 一张，2k、4k 0.2r 一张</div>
      </div>
    ),
  },
  {
    label: 'Venice qwen-image-3-edit',
    baseUrl: 'https://api.venice.ai',
    modelId: 'qwen-image-3-edit',
    currency: '$',
    remark: (
      <div>
        <div>
          官网：
          <a href="https://venice.ai" target="_blank">
            https://venice.ai/
          </a>
        </div>
        <div>
          <div>特殊适配的接入点</div>
          <div>固定使用 qwen-image-3-edit，每张固定消耗 0.04$</div>
          <div>仅支持 1k 和 2k，部分比例不支持</div>
        </div>
      </div>
    ),
  },
]
