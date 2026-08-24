// 预设接入点（UI 层）：基础信息来自 src/shared/gpt-image/endpoints（服务端同用），
// 此处仅按 label 合并富文本 remark 说明

import {
  ENDPOINT_PRESET_INFOS,
  type EndpointPresetInfo,
} from '@/shared/gpt-image/endpoints'
import { ReactNode } from 'react'

export {
  ENDPOINT_PRESET_INFOS,
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
  'openlux gpt-image-2-c': (
    <div>
      <div>
        官网：
        <a href="https://openlux.ai" target="_blank">
          https://openlux.ai/
        </a>
      </div>
      <div>无论1k、2k、4k，均固定计费</div>
      <div>Gpt-image-1 分组 $0.00882（约0.06r）一张</div>
      <div>Gpt-image-2 分组 $0.0110（约0.075r）一张</div>
    </div>
  ),
  'openlux gpt-image-2': (
    <div>
      <div>
        官网：
        <a href="https://openlux.ai" target="_blank">
          https://openlux.ai/
        </a>
      </div>
      <div>按量计费</div>
    </div>
  ),
  'DragonAPI gpt-image-2': (
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
  '【已废弃】云雾 gpt-image-2-c': (
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
  '【已废弃】云雾 gpt-image-2': (
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
}

export const ENDPOINT_PRESETS: EndpointPreset[] = ENDPOINT_PRESET_INFOS.map(
  (info) => ({ ...info, remark: PRESET_REMARKS[info.label] }),
)
