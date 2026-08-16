import { relayRequest } from '@/client/service/relay'
import { settingsClient } from '@/client/service/settings'
import type { TTSSettings } from '@/server/module/tts/settings'
import type { InworldVoiceItem } from '@/shared/tts/inworld'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const settings = settingsClient<TTSSettings>('tts')

export interface VoiceItemWithRemark extends InworldVoiceItem {
  remark?: string
}

interface TTSStore {
  /** Inworld API Key（用于"是否已配置"判断与表单回填） */
  ttsInworldApiKey: string | null
  fetchTTSConfig: () => Promise<void>
  setTTSInworldApiKey: (key: string | null) => Promise<void>

  voiceList: VoiceItemWithRemark[]
  loadingVoiceList: boolean
  hasFetchedVoiceList: boolean
  fetchVoiceList: () => Promise<void>
  updateVoiceRemark: (voiceId: string, remark: string) => void

  selectedProjectId: string | null
  setSelectedProjectId: (id: string | null) => void
}

export const useTTSStore = create<TTSStore>()(
  persist(
    (set, get) => ({
      ttsInworldApiKey: null,
      // TTS 配置走注册式设置接口 /api/settings/tts
      fetchTTSConfig: async () => {
        try {
          const res = await settings.get()
          set({ ttsInworldApiKey: res.value.ttsInworldApiKey ?? null })
        } catch (error) {
          console.error('Failed to fetch tts config', error)
        }
      },
      setTTSInworldApiKey: async (key) => {
        try {
          const res = await settings.put({ ttsInworldApiKey: key })
          set({ ttsInworldApiKey: res.value.ttsInworldApiKey ?? null })
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
      // 音色列表走受限请求中继（/api/relay/inworld），密钥由服务端注入
      fetchVoiceList: async () => {
        if (!get().ttsInworldApiKey) return

        set({ loadingVoiceList: true })
        try {
          const query = new URLSearchParams({
            filter: 'source = "IVC"',
            orderBy: 'display_name asc',
            pageSize: '100',
          })
          const data = await relayRequest<{ voices?: InworldVoiceItem[] }>(
            'inworld',
            { method: 'GET', path: `/voices/v1/voices?${query}` },
          )
          let remarks: Record<string, string> = {}
          try {
            const storedRemarksStr = localStorage.getItem('tts_voice_remarks')
            if (storedRemarksStr) {
              remarks = JSON.parse(storedRemarksStr)
            }
          } catch (e) {
            console.error('Failed to parse tts_voice_remarks', e)
          }

          const voiceList = (data.voices ?? []).map(
            (item: InworldVoiceItem) => ({
              ...item,
              remark: remarks[item.voiceId] || undefined,
            }),
          )

          set({ voiceList, hasFetchedVoiceList: true })
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
