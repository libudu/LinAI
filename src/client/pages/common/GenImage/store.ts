import type { AppType } from '@/server'
import { hc } from 'hono/client'
import { create } from 'zustand'
import type { CustomEndpoint } from './SettingModal/Endpoint/endpointPresets'

const client = hc<AppType>('/')

// GPT 图像模块配置状态：与服务端 data/images/config.json 同步（/api/gptImage/config）
interface GptImageState {
  gptImageApiKey: string | null
  gptImageBaseUrl: string | null
  gptImageModelId: string | null
  gptImageCustomEndpoints: CustomEndpoint[]
  gptImagePresetApiKeys: Record<string, string>
  setGptImageApiKey: (key: string | null) => Promise<void>
  setGptImageEndpoint: (
    baseUrl: string | null,
    modelId: string | null,
  ) => Promise<void>
  setGptImageCustomEndpoints: (endpoints: CustomEndpoint[]) => Promise<void>
  setGptImagePresetApiKeys: (keys: Record<string, string>) => Promise<void>
  fetchConfig: () => Promise<void>
}

type GptImageConfigData = Pick<
  GptImageState,
  | 'gptImageApiKey'
  | 'gptImageBaseUrl'
  | 'gptImageModelId'
  | 'gptImageCustomEndpoints'
  | 'gptImagePresetApiKeys'
>

export const useGptImageStore = create<GptImageState>()((set) => {
  // 提交部分配置，成功后用服务端返回的完整配置覆盖本地状态
  const postConfig = async (body: Partial<GptImageConfigData>) => {
    try {
      const res = await client.api.gptImage.config.$post({ json: body })
      const json = await res.json()
      if (json.success) {
        set(json.data)
      }
    } catch (error) {
      console.error('Failed to update config', error)
    }
  }

  return {
    gptImageApiKey: null,
    gptImageBaseUrl: null,
    gptImageModelId: null,
    gptImageCustomEndpoints: [],
    gptImagePresetApiKeys: {},
    setGptImageApiKey: (key) => postConfig({ gptImageApiKey: key }),
    setGptImageEndpoint: (baseUrl, modelId) =>
      postConfig({ gptImageBaseUrl: baseUrl, gptImageModelId: modelId }),
    setGptImageCustomEndpoints: (endpoints) =>
      postConfig({ gptImageCustomEndpoints: endpoints }),
    setGptImagePresetApiKeys: (keys) =>
      postConfig({ gptImagePresetApiKeys: keys }),
    fetchConfig: async () => {
      try {
        const res = await client.api.gptImage.config.$get()
        const json = await res.json()
        if (json.success) {
          set(json.data)
        }
      } catch (error) {
        console.error('Failed to fetch config', error)
      }
    },
  }
})
