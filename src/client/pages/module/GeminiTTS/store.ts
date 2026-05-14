import { hc } from 'hono/client'
import { create } from 'zustand'
import type { AppType } from '../../../../server'
import { AliVoiceListItem } from '../../../../server/module/tts'

const client = hc<AppType>('/')

interface TTSStore {
  voiceList: AliVoiceListItem[]
  loadingVoiceList: boolean
  hasFetchedVoiceList: boolean
  fetchVoiceList: (ttsAliApiKey: string) => Promise<void>
}

export const useTTSStore = create<TTSStore>((set) => ({
  voiceList: [],
  loadingVoiceList: false,
  hasFetchedVoiceList: false,
  fetchVoiceList: async (ttsAliApiKey: string) => {
    if (!ttsAliApiKey) return

    set({ loadingVoiceList: true })
    try {
      const res = await client.api['tts-ali'].voices.$get({
        query: { prefix: '' },
      })
      const json = await res.json()
      if (json.success) {
        set({ voiceList: json.data, hasFetchedVoiceList: true })
      } else {
        console.error(json.error || '获取音色列表失败')
      }
    } catch (error) {
      console.error(error)
    } finally {
      set({ loadingVoiceList: false })
    }
  },
}))
