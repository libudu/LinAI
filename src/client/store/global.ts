import type { AppType } from '@/server'
import type { FlatTemplate } from '@/shared/image/template'
import { hc } from 'hono/client'
import { create } from 'zustand'

const client = hc<AppType>('/')

interface GlobalState {
  localNetworkUrl: string | null
  fillTemplateData: Partial<FlatTemplate> | null
  setFillTemplateData: (data: Partial<FlatTemplate> | null) => void
  fetchConfig: () => Promise<void>
}

export const useGlobalStore = create<GlobalState>()((set) => ({
  localNetworkUrl: null,
  fillTemplateData: null,
  setFillTemplateData: (data) => set({ fillTemplateData: data }),
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
