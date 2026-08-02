import { useCallback, useEffect, useMemo, useRef } from 'react'

const DEFAULT_MAX_CACHE_SIZE = 20

const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(blob)
  })

export function usePreloadedImages(
  urls: string[],
  maxCacheSize = DEFAULT_MAX_CACHE_SIZE,
) {
  const cacheRef = useRef(new Map<string, string>())
  const pendingRef = useRef(new Map<string, Promise<string>>())

  const normalizedUrls = useMemo(
    () => Array.from(new Set(urls.filter(Boolean))),
    [urls],
  )

  const touchCache = useCallback((url: string, data: string) => {
    const cache = cacheRef.current
    if (cache.has(url)) {
      cache.delete(url)
    }
    cache.set(url, data)

    while (cache.size > maxCacheSize) {
      const oldestKey = cache.keys().next().value
      if (!oldestKey) {
        break
      }
      cache.delete(oldestKey)
    }
  }, [maxCacheSize])

  const getImageData = useCallback(
    async (url: string) => {
      if (!url) {
        throw new Error('图片地址不能为空')
      }

      const cached = cacheRef.current.get(url)
      if (cached) {
        touchCache(url, cached)
        return cached
      }

      const pending = pendingRef.current.get(url)
      if (pending) {
        return pending
      }

      const requestPromise = (async () => {
        const response = await fetch(url)
        if (!response.ok) {
          throw new Error(`图片下载失败: ${response.status}`)
        }

        const blob = await response.blob()
        const data = await blobToBase64(blob)
        touchCache(url, data)
        return data
      })()

      pendingRef.current.set(url, requestPromise)

      try {
        return await requestPromise
      } finally {
        pendingRef.current.delete(url)
      }
    },
    [touchCache],
  )

  useEffect(() => {
    normalizedUrls.forEach((url) => {
      void getImageData(url).catch(() => undefined)
    })
  }, [getImageData, normalizedUrls])

  return {
    getImageData,
  }
}
