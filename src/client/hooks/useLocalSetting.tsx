import type { GptImageQuality } from '@/server/module/gpt-image/enum'
import { useMemo } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface GPTImageSettings {
  enable1K: boolean
  enable2K: boolean
  enable4K: boolean
  quality: GptImageQuality
  enableMultiple?: boolean
  keepImageWhenDeleteTask?: boolean
  /** 任务列表图片左上角显示真实尺寸 */
  showImageSizeInTaskList?: boolean
}

export const defaultGPTImageSettings: GPTImageSettings = {
  enable1K: true,
  enable2K: true,
  enable4K: false,
  quality: 'medium',
  enableMultiple: false,
  keepImageWhenDeleteTask: false,
  showImageSizeInTaskList: true,
}

export interface LocalSettingState {
  gptImageSettings: GPTImageSettings
  promptOptimizeEnabled: boolean
  /** 图片风格提取开关：启用后在提示词输入框旁显示“图片风格提取”按钮 */
  styleExtractEnabled: boolean
  /** 比例拼接开关：启用后在提示词输入框旁显示“比例拼接”切换按钮 */
  appendAspectRatioEnabled: boolean
  /** 比例拼接：提交时在提示词末尾追加“图片比例X：Y”一行 */
  appendAspectRatio: boolean
  /** 首图自动填充比例：上传第一张图片时自动将比例设置为最接近的图片比例 */
  autoFillAspectRatio: boolean
  setGptImageSettings: (
    settings: GPTImageSettings | ((prev: GPTImageSettings) => GPTImageSettings),
  ) => void
  setPromptOptimizeEnabled: (enabled: boolean) => void
  setStyleExtractEnabled: (enabled: boolean) => void
  setAppendAspectRatioEnabled: (enabled: boolean) => void
  setAppendAspectRatio: (enabled: boolean) => void
  setAutoFillAspectRatio: (enabled: boolean) => void
}

const useLocalSettingStore = create<LocalSettingState>()(
  persist(
    (set) => ({
      gptImageSettings: defaultGPTImageSettings,
      promptOptimizeEnabled: true,
      styleExtractEnabled: true,
      appendAspectRatioEnabled: true,
      appendAspectRatio: false,
      autoFillAspectRatio: true,
      setGptImageSettings: (settings) =>
        set((state) => ({
          gptImageSettings:
            typeof settings === 'function'
              ? settings(state.gptImageSettings)
              : settings,
        })),
      setPromptOptimizeEnabled: (enabled) =>
        set({ promptOptimizeEnabled: enabled }),
      setStyleExtractEnabled: (enabled) =>
        set({ styleExtractEnabled: enabled }),
      setAppendAspectRatioEnabled: (enabled) =>
        set({ appendAspectRatioEnabled: enabled }),
      setAppendAspectRatio: (enabled) => set({ appendAspectRatio: enabled }),
      setAutoFillAspectRatio: (enabled) =>
        set({ autoFillAspectRatio: enabled }),
    }),
    {
      name: 'gpt-image-settings',
    },
  ),
)

export function useLocalSetting() {
  // 整 store 订阅：调用方本就需要访问多个字段，逐字段 selector 只是样板代码
  const state = useLocalSettingStore()

  // 合并默认值，兼容旧版本持久化数据缺少新增字段的情况
  const mergedSettings = useMemo(
    () => ({ ...defaultGPTImageSettings, ...state.gptImageSettings }),
    [state.gptImageSettings],
  )

  return { ...state, gptImageSettings: mergedSettings }
}
