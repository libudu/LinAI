import { useMemo } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GptImageQuality } from '../../server/module/gpt-image/enum'

export interface GPTImageSettings {
  enable1K: boolean
  enable2K: boolean
  enable4K: boolean
  quality: GptImageQuality
  enableMultiple?: boolean
}

export const defaultGPTImageSettings: GPTImageSettings = {
  enable1K: true,
  enable2K: true,
  enable4K: false,
  quality: 'medium',
  enableMultiple: false,
}

export interface LocalSettingState {
  gptImageSettings: GPTImageSettings
  yunwuSystemToken?: string
  yunwuUserId?: string
  setGptImageSettings: (
    settings: GPTImageSettings | ((prev: GPTImageSettings) => GPTImageSettings),
  ) => void
  setYunwuSystemToken: (token: string) => void
  setYunwuUserId: (userId: string) => void
}

const useLocalSettingStore = create<LocalSettingState>()(
  persist(
    (set) => ({
      gptImageSettings: defaultGPTImageSettings,
      yunwuSystemToken: undefined,
      yunwuUserId: undefined,
      setGptImageSettings: (settings) =>
        set((state) => ({
          gptImageSettings:
            typeof settings === 'function'
              ? settings(state.gptImageSettings)
              : settings,
        })),
      setYunwuSystemToken: (token) => set({ yunwuSystemToken: token }),
      setYunwuUserId: (userId) => set({ yunwuUserId: userId }),
    }),
    {
      name: 'gpt-image-settings',
    },
  ),
)

export function useLocalSetting() {
  const gptImageSettings = useLocalSettingStore(
    (state) => state.gptImageSettings,
  )
  const yunwuSystemToken = useLocalSettingStore(
    (state) => state.yunwuSystemToken,
  )
  const yunwuUserId = useLocalSettingStore((state) => state.yunwuUserId)
  const setGptImageSettings = useLocalSettingStore(
    (state) => state.setGptImageSettings,
  )
  const setYunwuSystemToken = useLocalSettingStore(
    (state) => state.setYunwuSystemToken,
  )
  const setYunwuUserId = useLocalSettingStore((state) => state.setYunwuUserId)

  const mergedSettings = useMemo(
    () => ({ ...defaultGPTImageSettings, ...gptImageSettings }),
    [gptImageSettings],
  )

  return {
    gptImageSettings: mergedSettings,
    yunwuSystemToken,
    yunwuUserId,
    setGptImageSettings,
    setYunwuSystemToken,
    setYunwuUserId,
  }
}
