import { hc } from 'hono/client'
import { create } from 'zustand'
import type { AppType } from '../../server'
import type { TaskTemplate } from '../../server/common/template-manager'

const client = hc<AppType>('/')

interface GlobalState {
  gptImageApiKey: string | null
  ttsInworldApiKey: string | null
  localNetworkUrl: string | null
  fillTemplateData: Partial<TaskTemplate> | null
  setFillTemplateData: (data: Partial<TaskTemplate> | null) => void
  setGptImageApiKey: (key: string | null) => Promise<void>
  setTTSInworldApiKey: (key: string | null) => Promise<void>
  fetchConfig: () => Promise<void>
}

export const useGlobalStore = create<GlobalState>()((set) => ({
  gptImageApiKey: null,
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
          ttsInworldApiKey: json.data.ttsInworldApiKey,
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
          ttsInworldApiKey: json.data.ttsInworldApiKey,
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
          ttsInworldApiKey: json.data.ttsInworldApiKey,
          localNetworkUrl: json.data.localNetworkUrl,
        })
      }
    } catch (error) {
      console.error('Failed to fetch config', error)
    }
  },
}))
