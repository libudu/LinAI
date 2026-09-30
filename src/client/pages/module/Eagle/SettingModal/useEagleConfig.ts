import { settingsClient } from '@/client/service/settings'
import type { EagleSettings } from '@/server/module/eagle/settings'
import { message } from 'antd'
import { create } from 'zustand'

const client = settingsClient<EagleSettings>('eagle')

// Eagle 模块配置（资源库路径），走注册式设置接口 /api/settings/eagle
interface EagleConfigState extends EagleSettings {
  revision: number
  fetchEagleConfig: () => Promise<void>
  setEagleConfig: (libraryPath: string | null) => Promise<void>
}

export const useEagleConfig = create<EagleConfigState>()((set, get) => ({
  libraryPath: null,
  revision: 0,
  fetchEagleConfig: async () => {
    try {
      const res = await client.get()
      set({ ...res.value, revision: res.revision })
    } catch (error) {
      console.error('Failed to fetch eagle config', error)
    }
  },
  setEagleConfig: async (libraryPath) => {
    try {
      const res = await client.put({ libraryPath }, get().revision)
      set({ ...res.value, revision: res.revision })
    } catch (error) {
      console.error('Failed to update eagle config', error)
      message.error('设置保存失败')
    }
  },
}))
