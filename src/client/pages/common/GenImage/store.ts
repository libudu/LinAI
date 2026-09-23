import { settingsClient } from '@/client/service/settings'
import type { GptImageSettings } from '@/server/module/gpt-image/settings'
import {
  resolveGptImageApiKey,
  type ComfyEndpoint,
} from '@/shared/gpt-image/endpoints'
import { message } from 'antd'
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
  gptImageEndpointKind: 'openai' | 'comfyui'
  gptImageEndpointId: string | null
  gptImageComfyEndpoints: ComfyEndpoint[]
  revision: number
  setGptImageEndpoint: (
    baseUrl: string | null,
    modelId: string | null,
    id?: string | null,
  ) => Promise<void>
  setGptImageCustomEndpoints: (endpoints: CustomEndpoint[]) => Promise<void>
  setGptImagePresetApiKeys: (keys: Record<string, string>) => Promise<void>
  setGptImageComfyEndpoints: (endpoints: ComfyEndpoint[]) => Promise<void>
  selectComfyEndpoint: (id: string) => Promise<void>
  fetchConfig: () => Promise<void>
}

type GptImageConfigData = Pick<
  GptImageState,
  | 'gptImageApiKey'
  | 'gptImageBaseUrl'
  | 'gptImageModelId'
  | 'gptImageCustomEndpoints'
  | 'gptImagePresetApiKeys'
  | 'gptImageEndpointKind'
  | 'gptImageEndpointId'
  | 'gptImageComfyEndpoints'
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
        gptImageEndpointKind: state.gptImageEndpointKind,
        gptImageEndpointId: state.gptImageEndpointId,
        gptImageComfyEndpoints: state.gptImageComfyEndpoints,
        ...patch,
      }
      const res = await client.put(next, state.revision)
      apply(res.value, res.revision)
    } catch (error) {
      console.error('Failed to update config', error)
      message.error('设置保存失败')
      throw error
    }
  }

  return {
    gptImageApiKey: null,
    gptImageBaseUrl: null,
    gptImageModelId: null,
    gptImageCustomEndpoints: [],
    gptImagePresetApiKeys: {},
    gptImageEndpointKind: 'openai',
    gptImageEndpointId: null,
    gptImageComfyEndpoints: [],
    revision: 0,
    setGptImageEndpoint: (baseUrl, modelId, id = null) =>
      postConfig({
        gptImageBaseUrl: baseUrl,
        gptImageModelId: modelId,
        gptImageEndpointKind: 'openai',
        gptImageEndpointId: id,
      }),
    setGptImageCustomEndpoints: (endpoints) =>
      postConfig({ gptImageCustomEndpoints: endpoints }),
    setGptImagePresetApiKeys: (keys) =>
      postConfig({ gptImagePresetApiKeys: keys }),
    setGptImageComfyEndpoints: (endpoints) =>
      postConfig({ gptImageComfyEndpoints: endpoints }),
    selectComfyEndpoint: (id) =>
      postConfig({ gptImageEndpointKind: 'comfyui', gptImageEndpointId: id }),
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
