import { templateCache } from '@/client/service/image-templates'
import { createResourceCache } from '@/client/service/resource-cache'
import { subscribeStorageEvent } from '@/client/service/storage-events'
import type { AppType } from '@/server'
import {
  GENERATED_IMAGES_API_PATH,
  INPUT_IMAGES_API_PATH,
} from '@/server/common/static/enum'
import { hc } from 'hono/client'
import { useEffect, useMemo } from 'react'

const client = hc<AppType>('/')

export type GalleryImageItem = {
  url: string
  type: 'input' | 'generated'
  createdAt: number
  isReferenced: boolean
}

export type InputFolderView = {
  folder: string
  urls: string[]
}

export const normalizeComparableUrl = (url: string) =>
  url
    .replace(/^https?:\/\/[^/]+/i, '')
    .split('?')[0]
    .split('#')[0]
    .trim()

const getComparableImageUrl = (type: GalleryImageItem['type'], url: string) => {
  const apiPath =
    type === 'input' ? INPUT_IMAGES_API_PATH : GENERATED_IMAGES_API_PATH
  const normalized = normalizeComparableUrl(url)
  return normalized.startsWith(`${apiPath}/`) ? normalized : null
}

const galleryCache = createResourceCache({
  resource: 'image.assets',
  initialValue: [] as GalleryImageItem[],
  load: async () => {
    const response = await client.api.static.images.list.$get()
    const result = await response.json()
    if (!response.ok || !result.success || !('data' in result))
      throw new Error('获取图库失败')
    return result.data as GalleryImageItem[]
  },
})

export function useGalleryImages(visible: boolean) {
  const {
    data: images,
    loading,
    loaded,
    error,
  } = galleryCache.useCache(visible)
  const { data: templates = [], loading: templatesLoading } =
    templateCache.useCache()
  const referencesReady = loaded && !error
  const imagesLoaded = loaded || !!error
  const imagesLoadSucceeded = loaded && !error
  const fetchImages = async (): Promise<GalleryImageItem[] | null> => {
    try {
      await galleryCache.refresh()
      return galleryCache.getState().data
    } catch {
      return null
    }
  }
  useEffect(() => {
    if (!visible) return
    const invalidate = galleryCache.invalidate
    const subscriptions = [
      'image.templates',
      'image.tasks',
      'image.pending',
    ].map((resource) => subscribeStorageEvent(resource, invalidate))
    return () => subscriptions.forEach((unsubscribe) => unsubscribe())
  }, [visible])
  const imageByUrl = useMemo(
    () => new Map(images.map((image) => [image.url, image])),
    [images],
  )

  const availableComparableUrlSet = useMemo(
    () => new Set(images.map((image) => normalizeComparableUrl(image.url))),
    [images],
  )

  const inputImages = useMemo(
    () => images.filter((image) => image.type === 'input'),
    [images],
  )

  const inputFolderViews = useMemo<InputFolderView[]>(() => {
    const inputImageByComparableUrl = new Map(
      inputImages.map((image) => [normalizeComparableUrl(image.url), image]),
    )
    const folderUrlSets = new Map<string, Set<string>>()

    templates.forEach((template) => {
      const folder = template.folder?.trim()
      if (!folder || !Array.isArray(template.images)) {
        return
      }

      const folderUrls = folderUrlSets.get(folder) ?? new Set<string>()
      template.images.forEach((url) => {
        const comparableUrl = getComparableImageUrl('input', url)
        if (comparableUrl && inputImageByComparableUrl.has(comparableUrl)) {
          folderUrls.add(comparableUrl)
        }
      })
      if (folderUrls.size > 0) {
        folderUrlSets.set(folder, folderUrls)
      }
    })

    return Array.from(folderUrlSets.entries())
      .sort(([folderA], [folderB]) => folderA.localeCompare(folderB))
      .map(([folder, comparableUrls]) => ({
        folder,
        urls: inputImages
          .filter((image) =>
            comparableUrls.has(normalizeComparableUrl(image.url)),
          )
          .map((image) => image.url),
      }))
  }, [inputImages, templates])

  const categorizedInputUrlSet = useMemo(
    () => new Set(inputFolderViews.flatMap((folder) => folder.urls)),
    [inputFolderViews],
  )

  const rootInputImageUrls = useMemo(
    () =>
      inputImages
        .filter((image) => !categorizedInputUrlSet.has(image.url))
        .map((image) => image.url),
    [categorizedInputUrlSet, inputImages],
  )

  const generatedImageUrls = useMemo(
    () =>
      images
        .filter((image) => image.type === 'generated')
        .map((image) => image.url),
    [images],
  )

  const unreferencedUrls = useMemo(
    () =>
      new Set(
        referencesReady
          ? images
              .filter((image) => image.isReferenced === false)
              .map((image) => normalizeComparableUrl(image.url))
          : [],
      ),
    [images, referencesReady],
  )

  const resolveImageType = (
    url: string,
  ): GalleryImageItem['type'] | undefined => {
    const image = imageByUrl.get(url)
    if (image) {
      return image.type
    }
    if (url.includes(INPUT_IMAGES_API_PATH)) {
      return 'input'
    }
    if (url.includes(GENERATED_IMAGES_API_PATH)) {
      return 'generated'
    }
    return undefined
  }

  return {
    images,
    loading,
    imagesLoaded,
    imagesLoadSucceeded,
    referencesReady,
    templatesLoading,
    availableComparableUrlSet,
    inputFolderViews,
    rootInputImageUrls,
    generatedImageUrls,
    unreferencedUrls,
    fetchImages,
    resolveImageType,
  }
}
