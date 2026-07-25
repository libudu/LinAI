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
  keepImageWhenDeleteTask?: boolean
}

export const defaultGPTImageSettings: GPTImageSettings = {
  enable1K: true,
  enable2K: true,
  enable4K: false,
  quality: 'medium',
  enableMultiple: false,
  keepImageWhenDeleteTask: false,
}

export interface LocalSettingState {
  gptImageSettings: GPTImageSettings
  promptOptimizeEnabled: boolean
  /** 比例拼接：提交时在提示词末尾追加“图片比例X：Y”一行 */
  appendAspectRatio: boolean
  yunwuSystemToken?: string
  yunwuUserId?: string
  setGptImageSettings: (
    settings: GPTImageSettings | ((prev: GPTImageSettings) => GPTImageSettings),
  ) => void
  setPromptOptimizeEnabled: (enabled: boolean) => void
  setAppendAspectRatio: (enabled: boolean) => void
  setYunwuSystemToken: (token: string) => void
  setYunwuUserId: (userId: string) => void
}

const useLocalSettingStore = create<LocalSettingState>()(
  persist(
    (set) => ({
      gptImageSettings: defaultGPTImageSettings,
      promptOptimizeEnabled: true,
      appendAspectRatio: false,
      yunwuSystemToken: undefined,
      yunwuUserId: undefined,
      setGptImageSettings: (settings) =>
        set((state) => ({
          gptImageSettings:
            typeof settings === 'function'
              ? settings(state.gptImageSettings)
              : settings,
        })),
      setPromptOptimizeEnabled: (enabled) =>
        set({ promptOptimizeEnabled: enabled }),
      setAppendAspectRatio: (enabled) => set({ appendAspectRatio: enabled }),
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
  const promptOptimizeEnabled = useLocalSettingStore(
    (state) => state.promptOptimizeEnabled,
  )
  const appendAspectRatio = useLocalSettingStore(
    (state) => state.appendAspectRatio,
  )
  const setGptImageSettings = useLocalSettingStore(
    (state) => state.setGptImageSettings,
  )
  const setPromptOptimizeEnabled = useLocalSettingStore(
    (state) => state.setPromptOptimizeEnabled,
  )
  const setAppendAspectRatio = useLocalSettingStore(
    (state) => state.setAppendAspectRatio,
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
    promptOptimizeEnabled,
    appendAspectRatio,
    yunwuSystemToken,
    yunwuUserId,
    setGptImageSettings,
    setPromptOptimizeEnabled,
    setAppendAspectRatio,
    setYunwuSystemToken,
    setYunwuUserId,
  }
}
