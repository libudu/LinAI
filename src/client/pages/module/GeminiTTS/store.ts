import { hc } from 'hono/client'
import { create } from 'zustand'
import type { AppType } from '../../../../server'
import { InworldVoiceItem } from '../../../../server/module/tts'

const client = hc<AppType>('/')

export interface VoiceItemWithRemark extends InworldVoiceItem {
  remark?: string
}

interface TTSStore {
  voiceList: VoiceItemWithRemark[]
  loadingVoiceList: boolean
  hasFetchedVoiceList: boolean
  fetchVoiceList: (ttsInworldApiKey: string) => Promise<void>
  updateVoiceRemark: (voiceId: string, remark: string) => void
}

export const useTTSStore = create<TTSStore>((set, get) => ({
  voiceList: [],
  loadingVoiceList: false,
  hasFetchedVoiceList: false,
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
}))
