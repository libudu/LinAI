import { create } from 'zustand'
import * as api from '../api'

// 小说模块配置（API Key / Base URL / 模型 ID），独立于全局 store，
// 后端存储在 data/novels/config.json
interface NovelConfigState {
  novelApiKey: string | null
  novelBaseUrl: string | null
  novelModelId: string | null
  fetchNovelConfig: () => Promise<void>
  setNovelConfig: (
    apiKey: string | null,
    baseUrl: string | null,
    modelId: string | null,
  ) => Promise<void>
}

export const useNovelConfig = create<NovelConfigState>()((set) => ({
  novelApiKey: null,
  novelBaseUrl: null,
  novelModelId: null,
  fetchNovelConfig: async () => {
    try {
      set(await api.getNovelConfig())
    } catch (error) {
      console.error('Failed to fetch novel config', error)
    }
  },
  setNovelConfig: async (apiKey, baseUrl, modelId) => {
    try {
      set(
        await api.updateNovelConfig({
          novelApiKey: apiKey,
          novelBaseUrl: baseUrl,
          novelModelId: modelId,
        }),
      )
    } catch (error) {
      console.error('Failed to update novel config', error)
    }
  },
}))
