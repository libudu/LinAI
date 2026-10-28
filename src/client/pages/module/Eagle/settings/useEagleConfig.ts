import { settingsClient } from '@/client/service/settings'
import type { EagleSettings } from '@/server/module/eagle/settings'
import { create } from 'zustand'
import { fetchDefaultLibraryDirectory } from '../api'
import { ensureEagleOwnerSession } from '../sharing/access'

const client = settingsClient<EagleSettings>('eagle')

// Eagle 模块配置（资源库路径），走注册式设置接口 /api/settings/eagle
interface EagleConfigState extends EagleSettings {
  defaultLibraryPath: string
  revision: number
  fetchEagleConfig: () => Promise<void>
  setEagleConfig: (config: Partial<EagleSettings>) => Promise<void>
}

export const useEagleConfig = create<EagleConfigState>()((set, get) => ({
  libraryPath: null,
  defaultLibraryPath: '',
  libraryMode: 'local',
  remoteUrl: '',
  invitationCode: '',
  revision: 0,
  fetchEagleConfig: async () => {
    try {
      await ensureEagleOwnerSession().catch(() => undefined)
      const [res, defaultDirectory] = await Promise.all([
        client.get(),
        fetchDefaultLibraryDirectory(),
      ])
      set({
        ...res.value,
        revision: res.revision,
        defaultLibraryPath: defaultDirectory.path,
      })
    } catch (error) {
      console.error('Failed to fetch eagle config', error)
      throw error
    }
  },
  setEagleConfig: async (config) => {
    await ensureEagleOwnerSession().catch(() => undefined)
    const { libraryPath, libraryMode, remoteUrl, invitationCode } = get()
    const res = await client.put(
      {
        libraryPath,
        libraryMode,
        remoteUrl,
        invitationCode,
        ...config,
      },
      get().revision,
    )
    set({ ...res.value, revision: res.revision })
  },
}))
