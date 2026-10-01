import { RefreshQueue } from '@/client/service/refresh-queue'
import { settingsClient } from '@/client/service/settings'
import { subscribeStorageEvent } from '@/client/service/storage-events'
import type { GptImageSettings } from '@/server/module/gpt-image/settings'
import {
  ENDPOINT_PRESET_INFOS,
  getImageEndpointCapabilities,
  resolveImageEndpoint,
  type ImageEndpointCapabilities,
  type ResolvedImageEndpoint,
} from '@/shared/gpt-image/endpoints'
import { create } from 'zustand'

const client = settingsClient<GptImageSettings>('gpt-image')
type GptImageConfigPatch = Partial<GptImageSettings>

interface GptImageState extends GptImageSettings {
  /** 派生展示字段，不写入配置。 */
  gptImageApiKey: string | null
  gptImageBaseUrl: string | null
  gptImageModelId: string | null
  gptImageEndpointKind: 'openai' | 'comfyui'
  currentEndpoint: ResolvedImageEndpoint | undefined
  capabilities: ImageEndpointCapabilities
  revision: number
  loaded: boolean
  error: Error | null
  saveConfig: (patch: GptImageConfigPatch) => Promise<void>
  fetchConfig: () => Promise<void>
}

export const useGptImageStore = create<GptImageState>()((set, get) => {
  const apply = (value: GptImageSettings, revision: number) => {
    if (revision < get().revision) return
    if (get().loaded && revision === get().revision) {
      set({ error: null })
      return
    }
    const endpoint = resolveImageEndpoint(value)
    set({
      ...value,
      revision,
      loaded: true,
      error: null,
      currentEndpoint: endpoint,
      capabilities: getImageEndpointCapabilities(
        endpoint ?? { protocol: 'openai' },
      ),
      gptImageApiKey:
        endpoint && endpoint.protocol !== 'comfyui'
          ? endpoint.apiKey || null
          : null,
      gptImageBaseUrl: endpoint?.baseUrl ?? null,
      gptImageModelId:
        endpoint && endpoint.protocol !== 'comfyui' ? endpoint.modelId : null,
      gptImageEndpointKind:
        endpoint?.protocol === 'comfyui' ? 'comfyui' : 'openai',
    })
  }
  const queue = new RefreshQueue(async () => {
    try {
      const res = await client.get()
      apply(res.value, res.revision)
    } catch (reason) {
      const error = reason instanceof Error ? reason : new Error(String(reason))
      set({ error })
      throw error
    }
  })
  let subscribed = false
  const fetchConfig = () => {
    if (!subscribed) {
      subscribed = true
      subscribeStorageEvent('settings.gpt-image', () => {
        void queue.request().catch(() => undefined)
      })
    }
    return queue.request()
  }
  return {
    gptImageEndpointId: `preset:${ENDPOINT_PRESET_INFOS[0].id}`,
    gptImageCustomEndpoints: [],
    gptImagePresetApiKeys: {},
    gptImageComfyEndpoints: [],
    gptImageApiKey: null,
    gptImageBaseUrl: null,
    gptImageModelId: null,
    gptImageEndpointKind: 'openai',
    currentEndpoint: undefined,
    capabilities: getImageEndpointCapabilities({ protocol: 'openai' }),
    revision: 0,
    loaded: false,
    error: null,
    fetchConfig,
    saveConfig: async (patch) => {
      if (!get().loaded) await fetchConfig()
      const state = get()
      const next: GptImageSettings = {
        gptImageEndpointId: state.gptImageEndpointId,
        gptImageCustomEndpoints: state.gptImageCustomEndpoints,
        gptImagePresetApiKeys: state.gptImagePresetApiKeys,
        gptImageComfyEndpoints: state.gptImageComfyEndpoints,
        ...patch,
      }
      try {
        const res = await client.put(next, state.revision)
        apply(res.value, res.revision)
      } catch (error) {
        // 冲突后重新读取实际设置，不自动覆盖用户在其他页面的修改。
        void queue.request().catch(() => undefined)
        throw error
      }
    },
  }
})
