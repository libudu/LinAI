import { hc } from 'hono/client'
import { create } from 'zustand'
import type { AppType } from '../../server'
import type { TaskTemplate } from '../../server/common/template-manager'

const client = hc<AppType>('/')

interface GlobalState {
  gptImageApiKey: string | null
  gptImageBaseUrl: string | null
  gptImageModelId: string | null
  ttsInworldApiKey: string | null
  localNetworkUrl: string | null
  fillTemplateData: Partial<TaskTemplate> | null
  setFillTemplateData: (data: Partial<TaskTemplate> | null) => void
  setGptImageApiKey: (key: string | null) => Promise<void>
  setGptImageEndpoint: (
    baseUrl: string | null,
    modelId: string | null,
  ) => Promise<void>
  setTTSInworldApiKey: (key: string | null) => Promise<void>
  fetchConfig: () => Promise<void>
}

export const useGlobalStore = create<GlobalState>()((set) => ({
  gptImageApiKey: null,
  gptImageBaseUrl: null,
  gptImageModelId: null,
  ttsInworldApiKey: null,
  localNetworkUrl: null,
  fillTemplateData: null,
  setFillTemplateData: (data) => set({ fillTemplateData: data }),
  setGptImageApiKey: async (key) => {
    try {
      const res = await client.api.config.$post({
        json: { gptImageApiKey: key },
      })
      const json = await res.json()
      if (json.success) {
        set({
          gptImageApiKey: json.data.gptImageApiKey,
          gptImageBaseUrl: json.data.gptImageBaseUrl ?? null,
          gptImageModelId: json.data.gptImageModelId ?? null,
          ttsInworldApiKey: json.data.ttsInworldApiKey ?? null,
          localNetworkUrl: json.data.localNetworkUrl,
        })
      }
    } catch (error) {
      console.error('Failed to update config', error)
    }
  },
  setGptImageEndpoint: async (baseUrl, modelId) => {
    try {
      const res = await client.api.config.$post({
        json: { gptImageBaseUrl: baseUrl, gptImageModelId: modelId },
      })
      const json = await res.json()
      if (json.success) {
        set({
          gptImageApiKey: json.data.gptImageApiKey,
          gptImageBaseUrl: json.data.gptImageBaseUrl ?? null,
          gptImageModelId: json.data.gptImageModelId ?? null,
          ttsInworldApiKey: json.data.ttsInworldApiKey ?? null,
          localNetworkUrl: json.data.localNetworkUrl,
        })
      }
    } catch (error) {
      console.error('Failed to update config', error)
    }
  },
  setTTSInworldApiKey: async (key) => {
    try {
      const res = await client.api.config.$post({
        json: { ttsInworldApiKey: key },
      })
      const json = await res.json()
      if (json.success) {
        set({
          gptImageApiKey: json.data.gptImageApiKey,
          gptImageBaseUrl: json.data.gptImageBaseUrl ?? null,
          gptImageModelId: json.data.gptImageModelId ?? null,
          ttsInworldApiKey: json.data.ttsInworldApiKey ?? null,
          localNetworkUrl: json.data.localNetworkUrl,
        })
      }
    } catch (error) {
      console.error('Failed to update config', error)
    }
  },
  fetchConfig: async () => {
    try {
      const res = await client.api.config.$get()
      const json = await res.json()
      if (json.success) {
        set({
          gptImageApiKey: json.data.gptImageApiKey,
          gptImageBaseUrl: json.data.gptImageBaseUrl ?? null,
          gptImageModelId: json.data.gptImageModelId ?? null,
          ttsInworldApiKey: json.data.ttsInworldApiKey ?? null,
          localNetworkUrl: json.data.localNetworkUrl,
        })
      }
    } catch (error) {
      console.error('Failed to fetch config', error)
    }
  },
}))
