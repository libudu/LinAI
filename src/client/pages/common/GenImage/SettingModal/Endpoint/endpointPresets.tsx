// 预设接入点（UI 层）：基础信息来自 src/shared/gpt-image/endpoints（服务端同用），
// 此处仅按 label 合并富文本 remark 说明

import {
  ENDPOINT_PRESET_INFOS,
  type EndpointPresetInfo,
} from '@/shared/gpt-image/endpoints'
import { ReactNode } from 'react'

export {
  ENDPOINT_PRESET_INFOS,
  findPresetEndpoint,
  resolvePresetApiKey,
  type CustomEndpoint,
  type EndpointPresetInfo,
  type GptImageSizeFormat,
} from '@/shared/gpt-image/endpoints'

export interface EndpointPreset extends EndpointPresetInfo {
  /** 补充说明，选中该接入点时展示在界面上 */
  remark?: ReactNode
}

// 各预设的界面说明，key 为预设 label
const PRESET_REMARKS: Record<string, ReactNode> = {
  'openlux gpt-image-2.5-sunburst-c': (
    <div>
      <div>
        官网：
        <a href="https://api.openlux.ai" target="_blank">
          https://api.openlux.ai/
        </a>
      </div>
      <div>同系列高精度版本，细节与提示词还原更强，面向精品商业图像创作。</div>
      <div>无论1k、2k、4k，均固定计费，约0.085r一张</div>
    </div>
  ),
  'DragonAPI gpt-image-2.5-sunburst': (
    <div>
      <div>
        官网：
        <a href="https://dragon3api.com" target="_blank">
          https://dragon3api.com/
        </a>
      </div>
      <div>固定计费 0.04 一张</div>
    </div>
  ),
  'Venice qwen-image-3-edit': (
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
}

export const ENDPOINT_PRESETS: EndpointPreset[] = ENDPOINT_PRESET_INFOS.map(
  (info) => ({ ...info, remark: PRESET_REMARKS[info.label] }),
)
