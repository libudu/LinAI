import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface GlobalState {
  gptImageApiKey: string | null
  setGptImageApiKey: (key: string | null) => void
}

export const useGlobalStore = create<GlobalState>()(
  persist(
    (set) => ({
      gptImageApiKey: null,
      setGptImageApiKey: (key) => set({ gptImageApiKey: key })
    }),
    {
      name: 'global-storage',
      partialize: (state) => ({ gptImageApiKey: state.gptImageApiKey })
    }
  )
)
