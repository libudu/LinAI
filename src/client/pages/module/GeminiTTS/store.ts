import type { AppType } from '@/server'
import { InworldVoiceItem } from '@/server/module/tts'
import { hc } from 'hono/client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const client = hc<AppType>('/')

export interface VoiceItemWithRemark extends InworldVoiceItem {
  remark?: string
}

interface TTSStore {
  ttsInworldApiKey: string | null
  fetchTTSConfig: () => Promise<void>
  setTTSInworldApiKey: (key: string | null) => Promise<void>

  voiceList: VoiceItemWithRemark[]
  loadingVoiceList: boolean
  hasFetchedVoiceList: boolean
  fetchVoiceList: (ttsInworldApiKey: string) => Promise<void>
  updateVoiceRemark: (voiceId: string, remark: string) => void

  selectedProjectId: string | null
  setSelectedProjectId: (id: string | null) => void
}

export const useTTSStore = create<TTSStore>()(
  persist(
    (set, get) => ({
      ttsInworldApiKey: null,
      // TTS 配置独立存储在后端 data/tts/config.json，走 /api/tts-inworld/config
      fetchTTSConfig: async () => {
        try {
          const res = await client.api['tts-inworld'].config.$get()
          const json = await res.json()
          if (json.success) {
            set({ ttsInworldApiKey: json.data.ttsInworldApiKey ?? null })
          }
        } catch (error) {
          console.error('Failed to fetch tts config', error)
        }
      },
      setTTSInworldApiKey: async (key) => {
        try {
          const res = await client.api['tts-inworld'].config.$post({
            json: { ttsInworldApiKey: key },
          })
          const json = await res.json()
          if (json.success) {
            set({ ttsInworldApiKey: json.data.ttsInworldApiKey ?? null })
          }
        } catch (error) {
          console.error('Failed to update tts config', error)
        }
      },
      voiceList: [],
      loadingVoiceList: false,
      hasFetchedVoiceList: false,
      selectedProjectId: null,
      setSelectedProjectId: (id: string | null) =>
        set({ selectedProjectId: id }),
      fetchVoiceList: async (ttsInworldApiKey: string) => {
        if (!ttsInworldApiKey) return

        set({ loadingVoiceList: true })
        try {
          const res = await client.api['tts-inworld'].voices.$get()
          const json = await res.json()
          if (json.success) {
            let remarks: Record<string, string> = {}
            try {
              const storedRemarksStr = localStorage.getItem('tts_voice_remarks')
              if (storedRemarksStr) {
                remarks = JSON.parse(storedRemarksStr)
              }
            } catch (e) {
              console.error('Failed to parse tts_voice_remarks', e)
            }

            const voiceList = json.data.map((item: InworldVoiceItem) => ({
              ...item,
              remark: remarks[item.voiceId] || undefined,
            }))

            set({ voiceList, hasFetchedVoiceList: true })
          } else {
            console.error(json.error || '获取音色列表失败')
          }
        } catch (error) {
          console.error(error)
        } finally {
          set({ loadingVoiceList: false })
        }
      },
      updateVoiceRemark: (voiceId: string, remark: string) => {
        let remarks: Record<string, string> = {}
        try {
          const storedRemarksStr = localStorage.getItem('tts_voice_remarks')
          if (storedRemarksStr) {
            remarks = JSON.parse(storedRemarksStr)
          }
        } catch (e) {
          console.error('Failed to parse tts_voice_remarks', e)
        }

        if (remark) {
          remarks[voiceId] = remark
        } else {
          delete remarks[voiceId]
        }

        localStorage.setItem('tts_voice_remarks', JSON.stringify(remarks))

        const { voiceList } = get()
        set({
          voiceList: voiceList.map((v) =>
            v.voiceId === voiceId ? { ...v, remark: remark || undefined } : v,
          ),
        })
      },
    }),
    {
      name: 'tts-store',
      partialize: (state) => ({ selectedProjectId: state.selectedProjectId }),
    },
  ),
)
