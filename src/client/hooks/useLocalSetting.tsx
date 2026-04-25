import { useLocalStorageState } from 'ahooks'

export interface GPTImageSettings {
  enable1K: boolean
  enable2K: boolean
  enable4K: boolean
}

export const defaultGPTImageSettings: GPTImageSettings = {
  enable1K: true,
  enable2K: true,
  enable4K: false
}

export function useLocalSetting() {
  const [gptImageSettings, setGptImageSettings] =
    useLocalStorageState<GPTImageSettings>('gpt-image-settings', {
      defaultValue: defaultGPTImageSettings
    })

  return {
    gptImageSettings: gptImageSettings || defaultGPTImageSettings,
    setGptImageSettings
  }
}
