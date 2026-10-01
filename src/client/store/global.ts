import type { AppType } from '@/server'
import { hc } from 'hono/client'
import { create } from 'zustand'

const client = hc<AppType>('/')

interface GlobalState {
  localNetworkUrl: string | null
  fetchConfig: () => Promise<void>
}

export const useGlobalStore = create<GlobalState>()((set) => ({
  localNetworkUrl: null,
  fetchConfig: async () => {
    try {
      const res = await client.api.config.$get()
      const json = await res.json()
      if (json.success) {
        set({ localNetworkUrl: json.data.localNetworkUrl })
      }
    } catch (error) {
      console.error('Failed to fetch config', error)
    }
  },
}))
