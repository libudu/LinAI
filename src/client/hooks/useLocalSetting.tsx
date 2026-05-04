import { useMemo } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GptImageQuality } from '../../server/module/gpt-image/enum'
import { FEATURE_FLAGS } from '../utils/featureFlags'

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

const defaultFeatureFlags: Record<string, boolean> = Object.fromEntries(
  Object.values(FEATURE_FLAGS).map((flag) => [
    flag.id,
    flag.defaultEnabled ?? false,
  ]),
)

export interface LocalSettingState {
  gptImageSettings: GPTImageSettings
  yunwuSystemToken?: string
  yunwuUserId?: string
  featureFlags: Record<string, boolean>
  setGptImageSettings: (
    settings: GPTImageSettings | ((prev: GPTImageSettings) => GPTImageSettings),
  ) => void
  setYunwuSystemToken: (token: string) => void
  setYunwuUserId: (userId: string) => void
  setFeatureFlags: (
    flags: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>),
  ) => void
}

const useLocalSettingStore = create<LocalSettingState>()(
  persist(
    (set) => ({
      gptImageSettings: defaultGPTImageSettings,
      yunwuSystemToken: undefined,
      yunwuUserId: undefined,
      featureFlags: defaultFeatureFlags,
      setGptImageSettings: (settings) =>
        set((state) => ({
          gptImageSettings:
            typeof settings === 'function'
              ? settings(state.gptImageSettings)
              : settings,
        })),
      setYunwuSystemToken: (token) => set({ yunwuSystemToken: token }),
      setYunwuUserId: (userId) => set({ yunwuUserId: userId }),
      setFeatureFlags: (flags) =>
        set((state) => ({
          featureFlags:
            typeof flags === 'function' ? flags(state.featureFlags) : flags,
        })),
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
  const featureFlags = useLocalSettingStore((state) => state.featureFlags)
  const setGptImageSettings = useLocalSettingStore(
    (state) => state.setGptImageSettings,
  )
  const setYunwuSystemToken = useLocalSettingStore(
    (state) => state.setYunwuSystemToken,
  )
  const setYunwuUserId = useLocalSettingStore((state) => state.setYunwuUserId)
  const setFeatureFlags = useLocalSettingStore((state) => state.setFeatureFlags)

  const mergedSettings = useMemo(
    () => ({ ...defaultGPTImageSettings, ...gptImageSettings }),
    [gptImageSettings],
  )

  return {
    gptImageSettings: mergedSettings,
    yunwuSystemToken,
    yunwuUserId,
    featureFlags,
    setGptImageSettings,
    setYunwuSystemToken,
    setYunwuUserId,
    setFeatureFlags,
  }
}
