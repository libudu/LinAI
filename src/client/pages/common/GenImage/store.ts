import { settingsClient } from '@/client/service/settings'
import type { GptImageSettings } from '@/server/module/gpt-image/settings'
import { resolveGptImageApiKey } from '@/shared/gpt-image/endpoints'
import { create } from 'zustand'
import type { CustomEndpoint } from './SettingModal/Endpoint/endpointPresets'

const client = settingsClient<GptImageSettings>('gpt-image')

// GPT 图像模块设置状态：与服务端注册式设置同步（/api/settings/gpt-image）
interface GptImageState {
  /** 当前接入点生效的 API Key（从 keychain 派生，用于"是否已配置"判断与表单回填） */
  gptImageApiKey: string | null
  gptImageBaseUrl: string | null
  gptImageModelId: string | null
  gptImageCustomEndpoints: CustomEndpoint[]
  gptImagePresetApiKeys: Record<string, string>
  revision: number
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

export const useGptImageStore = create<GptImageState>()((set, get) => {
  // 应用服务端返回的设置：gptImageApiKey 按当前接入点从 keychain 派生
  const apply = (value: GptImageSettings, revision: number) => {
    set({
      ...value,
      revision,
      gptImageApiKey: resolveGptImageApiKey(value),
    })
  }

  // 整体替换提交（含本地修订号做冲突检测），成功后用服务端返回覆盖本地状态
  const postConfig = async (patch: Partial<GptImageConfigData>) => {
    try {
      const state = get()
      const next: GptImageSettings = {
        // state.gptImageApiKey 是按当前接入点解析出的生效 key，不能写回平铺兜底字段；
        // 密钥只保存在 keychain（预设/自定义接入点），平铺字段固定清除避免残留旧 key
        gptImageApiKey: null,
        gptImageBaseUrl: state.gptImageBaseUrl,
        gptImageModelId: state.gptImageModelId,
        gptImageCustomEndpoints: state.gptImageCustomEndpoints,
        gptImagePresetApiKeys: state.gptImagePresetApiKeys,
        ...patch,
      }
      const res = await client.put(next, state.revision)
      apply(res.value, res.revision)
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
    revision: 0,
    setGptImageEndpoint: (baseUrl, modelId) =>
      postConfig({ gptImageBaseUrl: baseUrl, gptImageModelId: modelId }),
    setGptImageCustomEndpoints: (endpoints) =>
      postConfig({ gptImageCustomEndpoints: endpoints }),
    setGptImagePresetApiKeys: (keys) =>
      postConfig({ gptImagePresetApiKeys: keys }),
    fetchConfig: async () => {
      try {
        const res = await client.get()
        apply(res.value, res.revision)
      } catch (error) {
        console.error('Failed to fetch config', error)
      }
    },
  }
})
