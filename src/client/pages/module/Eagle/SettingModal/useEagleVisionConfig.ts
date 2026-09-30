import { settingsClient } from '@/client/service/settings'
import type { EagleVisionSettings } from '@/server/module/eagle/settings'
import { resolveVisionApiKey } from '@/shared/vision/endpoints'
import { message } from 'antd'
import { create } from 'zustand'

const client = settingsClient<EagleVisionSettings>('eagle-vision')

// Eagle 模块的视觉接入点配置（/api/settings/eagle-vision），与图片生成的 vision 配置互相独立
interface EagleVisionConfigState extends EagleVisionSettings {
  /** 当前接入点从独立 keychain 派生出的生效密钥 */
  visionApiKey: string | null
  revision: number
  fetchConfig: () => Promise<void>
  setEndpoint: (baseUrl: string, modelId: string) => Promise<void>
  setCustomEndpoints: (
    endpoints: EagleVisionSettings['visionCustomEndpoints'],
  ) => Promise<void>
  setPresetApiKeys: (keys: Record<string, string>) => Promise<void>
}

export const useEagleVisionConfig = create<EagleVisionConfigState>()((
  set,
  get,
) => {
  const apply = (value: EagleVisionSettings, revision: number) => {
    set({
      ...value,
      revision,
      visionApiKey: resolveVisionApiKey(value),
    })
  }

  const putConfig = async (
    patch: Partial<
      Pick<
        EagleVisionConfigState,
        | 'visionBaseUrl'
        | 'visionModelId'
        | 'visionCustomEndpoints'
        | 'visionPresetApiKeys'
      >
    >,
  ) => {
    const state = get()
    const next: EagleVisionSettings = {
      visionBaseUrl: state.visionBaseUrl,
      visionModelId: state.visionModelId,
      visionCustomEndpoints: state.visionCustomEndpoints,
      visionPresetApiKeys: state.visionPresetApiKeys,
      ...patch,
    }
    const result = await client.put(next, state.revision)
    apply(result.value, result.revision)
  }

  return {
    visionApiKey: null,
    visionBaseUrl: '',
    visionModelId: '',
    visionCustomEndpoints: [],
    visionPresetApiKeys: {},
    revision: 0,
    fetchConfig: async () => {
      try {
        const result = await client.get()
        apply(result.value, result.revision)
      } catch (error) {
        console.error('Failed to fetch eagle vision config', error)
        message.error('视觉接入点设置加载失败')
      }
    },
    setEndpoint: (baseUrl, modelId) =>
      putConfig({ visionBaseUrl: baseUrl, visionModelId: modelId }),
    setCustomEndpoints: (endpoints) =>
      putConfig({ visionCustomEndpoints: endpoints }),
    setPresetApiKeys: (keys) => putConfig({ visionPresetApiKeys: keys }),
  }
})
