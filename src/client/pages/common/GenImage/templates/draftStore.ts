import type { FlatTemplate } from '@/shared/image/template'
import { create } from 'zustand'

interface TemplateDraftState {
  fillTemplateData: Partial<FlatTemplate> | null
  setFillTemplateData: (data: Partial<FlatTemplate> | null) => void
}

// 历史任务回填仅在生图页面内部传递，不属于全应用配置。
export const useTemplateDraftStore = create<TemplateDraftState>()((set) => ({
  fillTemplateData: null,
  setFillTemplateData: (data) => set({ fillTemplateData: data }),
}))
