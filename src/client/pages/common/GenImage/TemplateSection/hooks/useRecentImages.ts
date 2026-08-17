import { useLocalStorageState } from 'ahooks'
import { useCallback } from 'react'

const LOCAL_STORAGE_KEY = 'recent_uploaded_images'
const MAX_STORED_RECENT_IMAGES = 30
export const MAX_VISIBLE_RECENT_IMAGES = 20

function normalizeUrls(urls: string | string[]) {
  return (Array.isArray(urls) ? urls : [urls]).filter(Boolean)
}

export function useRecentImages() {
  const [recentImages, setRecentImages] = useLocalStorageState<string[]>(
    LOCAL_STORAGE_KEY,
    {
      defaultValue: [],
    },
  )

  const addRecentImages = useCallback(
    (urls: string | string[]) => {
      const normalizedUrls = normalizeUrls(urls)
      if (normalizedUrls.length === 0) {
        return
      }

      setRecentImages((prev = []) =>
        [
          ...normalizedUrls,
          ...prev.filter((url) => !normalizedUrls.includes(url)),
        ].slice(0, MAX_STORED_RECENT_IMAGES),
      )
    },
    [setRecentImages],
  )

  const removeRecentImages = useCallback(
    (urls: string | string[]) => {
      const normalizedUrls = normalizeUrls(urls)
      if (normalizedUrls.length === 0) {
        return
      }

      const removedUrlSet = new Set(normalizedUrls)
      setRecentImages((prev = []) =>
        prev.filter((url) => !removedUrlSet.has(url)),
      )
    },
    [setRecentImages],
  )

  return {
    recentImages: recentImages || [],
    addRecentImages,
    removeRecentImages,
  }
}
