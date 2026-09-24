import { create } from 'zustand'

const STORAGE_KEY = 'gallery_pending_images'

const loadPendingUrls = (): string[] => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(value)
      ? [...new Set(value.filter((url): url is string => typeof url === 'string'))]
      : []
  } catch {
    return []
  }
}

interface PendingImagesState {
  urls: string[]
  add: (url: string) => void
  retain: (availableUrls: ReadonlySet<string>) => void
}

export const usePendingImages = create<PendingImagesState>()((set) => ({
  urls: loadPendingUrls(),
  add: (url) =>
    set((state) => {
      if (state.urls.includes(url)) return state
      const urls = [url, ...state.urls]
      localStorage.setItem(STORAGE_KEY, JSON.stringify(urls))
      return { urls }
    }),
  retain: (availableUrls) =>
    set((state) => {
      const urls = state.urls.filter((url) => availableUrls.has(url))
      if (urls.length === state.urls.length) return state
      localStorage.setItem(STORAGE_KEY, JSON.stringify(urls))
      return { urls }
    }),
}))
