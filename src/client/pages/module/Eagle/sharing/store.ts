import { create } from 'zustand'
import type { SharingStatus } from './api'

export const useEagleSharing = create<SharingStatus & { connected: boolean }>()(
  () => ({ incoming: [], outgoing: null, connected: false }),
)
