import { settingsClient } from '@/client/service/settings'
import type { NovelSettings } from '@/server/module/novel/settings'
import { message } from 'antd'
import { create } from 'zustand'

const client = settingsClient<NovelSettings>('novel')

// 小说模块配置（API Key / Base URL / 模型 ID），独立于全局 store，
// 走注册式设置接口 /api/settings/novel
interface NovelConfigState extends NovelSettings {
  revision: number
  fetchNovelConfig: () => Promise<void>
  setNovelConfig: (
    apiKey: string | null,
    baseUrl: string | null,
    modelId: string | null,
  ) => Promise<void>
}

export const useNovelConfig = create<NovelConfigState>()((set, get) => ({
  novelApiKey: null,
  novelBaseUrl: null,
  novelModelId: null,
  revision: 0,
  fetchNovelConfig: async () => {
    try {
      const res = await client.get()
      set({ ...res.value, revision: res.revision })
    } catch (error) {
      console.error('Failed to fetch novel config', error)
    }
  },
  setNovelConfig: async (apiKey, baseUrl, modelId) => {
    try {
      const res = await client.put(
        {
          novelApiKey: apiKey,
          novelBaseUrl: baseUrl,
          novelModelId: modelId,
        },
        get().revision,
      )
      set({ ...res.value, revision: res.revision })
    } catch (error) {
      console.error('Failed to update novel config', error)
      message.error('设置保存失败')
    }
  },
}))
