import {
  VisionEndpointSetting as CommonVisionEndpointSetting,
  type VisionEndpointSettingRef,
} from '@/client/pages/common/components/VisionEndpoint/VisionEndpointSetting'
import { forwardRef, useEffect } from 'react'
import { useEagleVisionConfig } from './useEagleVisionConfig'

export type { VisionEndpointSettingRef }

// Eagle 的视觉接入点：绑定 eagle-vision 配置（与图片生成的 vision 配置互相独立）
export const VisionEndpointSetting = forwardRef<VisionEndpointSettingRef>(
  (_props, ref) => {
    const {
      visionApiKey,
      visionBaseUrl,
      visionModelId,
      visionCustomEndpoints,
      visionPresetApiKeys,
      setEndpoint,
      setCustomEndpoints,
      setPresetApiKeys,
      fetchConfig,
    } = useEagleVisionConfig()

    // 弹窗可从侧栏直接打开（页面未挂载），这里保证拿到最新配置
    useEffect(() => {
      fetchConfig()
    }, [fetchConfig])

    return (
      <CommonVisionEndpointSetting
        ref={ref}
        apiKey={visionApiKey}
        baseUrl={visionBaseUrl}
        modelId={visionModelId}
        customEndpoints={visionCustomEndpoints}
        presetApiKeys={visionPresetApiKeys}
        setEndpoint={setEndpoint}
        setCustomEndpoints={setCustomEndpoints}
        setPresetApiKeys={setPresetApiKeys}
        noticeTitle="视觉接入点独立配置"
        notice="此处的 API Key 仅用于 Eagle 图片整理等功能，不与图片生成的视觉接入点共用；第三方中转站请小额试用、随用随充。"
      />
    )
  },
)
