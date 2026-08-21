import {
  VisionEndpointSetting as CommonVisionEndpointSetting,
  type VisionEndpointSettingRef,
} from '@/client/pages/common/components/VisionEndpoint/VisionEndpointSetting'
import { forwardRef } from 'react'
import { useVisionStore } from '../../visionStore'

export type { VisionEndpointSettingRef }

// 图片生成的视觉接入点：绑定 vision 配置（与生图接入点独立）
export const VisionEndpointSetting = forwardRef<VisionEndpointSettingRef>(
  (_props, ref) => {
    const {
      visionApiKey,
      visionBaseUrl,
      visionModelId,
      visionCustomEndpoints,
      visionPresetApiKeys,
      setVisionEndpoint,
      setVisionCustomEndpoints,
      setVisionPresetApiKeys,
    } = useVisionStore()

    return (
      <CommonVisionEndpointSetting
        ref={ref}
        apiKey={visionApiKey}
        baseUrl={visionBaseUrl}
        modelId={visionModelId}
        customEndpoints={visionCustomEndpoints}
        presetApiKeys={visionPresetApiKeys}
        setEndpoint={setVisionEndpoint}
        setCustomEndpoints={setVisionCustomEndpoints}
        setPresetApiKeys={setVisionPresetApiKeys}
        noticeTitle="视觉接入点独立配置"
        notice="此处的 API Key 不与生图接入点共用；第三方中转站请小额试用、随用随充。"
      />
    )
  },
)
