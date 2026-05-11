import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface DisabledVoicesState {
  disabledVoices: string[]
  setDisabledVoices: (voices: string[] | ((prev: string[]) => string[])) => void
}

const useDisabledVoicesStore = create<DisabledVoicesState>()(
  persist(
    (set) => ({
      disabledVoices: [],
      setDisabledVoices: (voices) =>
        set((state) => ({
          disabledVoices:
            typeof voices === 'function' ? voices(state.disabledVoices) : voices,
        })),
    }),
    {
      name: 'gemini-tts-disabled-voices',
    },
  ),
)

export function useDisabledVoices() {
  const disabledVoices = useDisabledVoicesStore((state) => state.disabledVoices)
  const setDisabledVoices = useDisabledVoicesStore(
    (state) => state.setDisabledVoices,
  )

  return [disabledVoices, setDisabledVoices] as const
}
