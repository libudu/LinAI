import { settingsClient } from '@/client/service/settings'
import type { VisionSettings } from '@/server/module/vision/settings'
import { resolveVisionApiKey } from '@/shared/vision/endpoints'
import { message } from 'antd'
import { create } from 'zustand'

const client = settingsClient<VisionSettings>('vision')

interface VisionState extends VisionSettings {
  /** 当前接入点从独立 keychain 派生出的生效密钥 */
  visionApiKey: string | null
  revision: number
  setVisionEndpoint: (baseUrl: string, modelId: string) => Promise<void>
  setVisionCustomEndpoints: (
    endpoints: VisionSettings['visionCustomEndpoints'],
  ) => Promise<void>
  setVisionPresetApiKeys: (keys: Record<string, string>) => Promise<void>
  fetchConfig: () => Promise<void>
}

type VisionConfigData = Pick<
  VisionState,
  | 'visionBaseUrl'
  | 'visionModelId'
  | 'visionCustomEndpoints'
  | 'visionPresetApiKeys'
>

export const useVisionStore = create<VisionState>()((set, get) => {
  const apply = (value: VisionSettings, revision: number) => {
    set({
      ...value,
      revision,
      visionApiKey: resolveVisionApiKey(value),
    })
  }

  const putConfig = async (patch: Partial<VisionConfigData>) => {
    const state = get()
    const next: VisionSettings = {
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
    setVisionEndpoint: (baseUrl, modelId) =>
      putConfig({ visionBaseUrl: baseUrl, visionModelId: modelId }),
    setVisionCustomEndpoints: (endpoints) =>
      putConfig({ visionCustomEndpoints: endpoints }),
    setVisionPresetApiKeys: (keys) =>
      putConfig({ visionPresetApiKeys: keys }),
    fetchConfig: async () => {
      try {
        const result = await client.get()
        apply(result.value, result.revision)
      } catch (error) {
        console.error('Failed to fetch vision config', error)
        message.error('视觉接入点设置加载失败')
      }
    },
  }
})
