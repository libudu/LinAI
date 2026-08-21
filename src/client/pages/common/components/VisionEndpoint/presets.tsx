import {
  VISION_ENDPOINT_PRESET_INFOS,
  type VisionEndpointPresetInfo,
} from '@/shared/vision/endpoints'
import type { ReactNode } from 'react'

export interface VisionEndpointPreset extends VisionEndpointPresetInfo {
  remark?: ReactNode
}

const PRESET_REMARKS: Record<string, ReactNode> = {
  'DragonAPI gpt-5.6-luna': (
    <div>
      官网：
      <a href="https://dragon3api.com" target="_blank">
        https://dragon3api.com/
      </a>
    </div>
  ),
}

export const VISION_ENDPOINT_PRESETS: VisionEndpointPreset[] =
  VISION_ENDPOINT_PRESET_INFOS.map((info) => ({
    ...info,
    remark: PRESET_REMARKS[info.label],
  }))
