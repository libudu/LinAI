import { useLocalStorageState } from 'ahooks'

const LOCAL_STORAGE_KEY = 'recent_uploaded_images'
const MAX_RECENT_IMAGES = 20

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

  const addRecentImages = (urls: string | string[]) => {
    const normalizedUrls = normalizeUrls(urls)
    if (normalizedUrls.length === 0) {
      return
    }

    setRecentImages((prev = []) =>
      [...normalizedUrls, ...prev.filter((url) => !normalizedUrls.includes(url))]
        .slice(0, MAX_RECENT_IMAGES),
    )
  }

  return {
    recentImages: recentImages || [],
    addRecentImages,
  }
}
