import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface CustomVoiceTagsState {
  tags: Record<string, string[]>
  addTag: (voiceName: string, tag: string) => void
  removeTag: (voiceName: string, tag: string) => void
}

export const useCustomVoiceTagsStore = create<CustomVoiceTagsState>()(
  persist(
    (set) => ({
      tags: {},
      addTag: (voiceName, tag) =>
        set((state) => {
          const currentTags = state.tags[voiceName] || []
          if (currentTags.includes(tag)) return state
          return {
            tags: {
              ...state.tags,
              [voiceName]: [...currentTags, tag],
            },
          }
        }),
      removeTag: (voiceName, tag) =>
        set((state) => {
          const currentTags = state.tags[voiceName] || []
          return {
            tags: {
              ...state.tags,
              [voiceName]: currentTags.filter((t) => t !== tag),
            },
          }
        }),
    }),
    {
      name: 'voice-custom-tags-storage',
    }
  )
)
