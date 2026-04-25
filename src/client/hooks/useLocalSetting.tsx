import { useMemo } from 'react'
import { useLocalStorageState } from 'ahooks'
import type { GptImageQuality } from '../../server/module/gpt-image/enum'

export interface GPTImageSettings {
  enable1K: boolean
  enable2K: boolean
  enable4K: boolean
  quality: GptImageQuality
}

export const defaultGPTImageSettings: GPTImageSettings = {
  enable1K: true,
  enable2K: true,
  enable4K: false,
  quality: 'medium'
}

export function useLocalSetting() {
  const [gptImageSettings, setGptImageSettings] =
    useLocalStorageState<GPTImageSettings>('gpt-image-settings', {
      defaultValue: defaultGPTImageSettings
    })

  const mergedSettings = useMemo(
    () => ({ ...defaultGPTImageSettings, ...gptImageSettings }),
    [gptImageSettings]
  )

  return {
    gptImageSettings: mergedSettings,
    setGptImageSettings
  }
}
