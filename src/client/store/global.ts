import { hc } from 'hono/client'
import { create } from 'zustand'
import type { AppType } from '../../server'

const client = hc<AppType>('/')

interface GlobalState {
  gptImageApiKey: string | null
  localNetworkUrl: string | null
  setGptImageApiKey: (key: string | null) => Promise<void>
  fetchConfig: () => Promise<void>
}

export const useGlobalStore = create<GlobalState>()((set) => ({
  gptImageApiKey: null,
  localNetworkUrl: null,
  setGptImageApiKey: async (key) => {
    try {
      const res = await client.api.config.$post({
        json: { gptImageApiKey: key },
      })
      const json = await res.json()
      if (json.success) {
        set({
          gptImageApiKey: json.data.gptImageApiKey,
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
          localNetworkUrl: json.data.localNetworkUrl,
        })
      }
    } catch (error) {
      console.error('Failed to fetch config', error)
    }
  },
}))
