import type { AppType } from '@/server'
import {
  GENERATED_IMAGES_API_PATH,
  INPUT_IMAGES_API_PATH,
} from '@/server/common/static/enum'
import { hc } from 'hono/client'
import { useEffect, useMemo, useState } from 'react'
import { useTasks } from '../../../hooks/useTasks'
import { useTemplates } from '../../hooks/useTemplates'

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

const getComparableImageUrl = (
  type: GalleryImageItem['type'],
  url: string,
): string | null => {
  const apiPath =
    type === 'input' ? INPUT_IMAGES_API_PATH : GENERATED_IMAGES_API_PATH
  const normalizedUrl = normalizeComparableUrl(url)

  return normalizedUrl.startsWith(`${apiPath}/`) ? normalizedUrl : null
}

type FetchedImage = Omit<GalleryImageItem, 'isReferenced'>

export function useGalleryImages(visible: boolean) {
  const [fetchedImages, setFetchedImages] = useState<FetchedImage[]>([])
  const [loading, setLoading] = useState(false)
  const [imagesLoaded, setImagesLoaded] = useState(false)
  const [imagesLoadSucceeded, setImagesLoadSucceeded] = useState(false)
  const { data: templates = [], loading: templatesLoading } = useTemplates()
  const { data: tasks = [], loading: tasksLoading } = useTasks()

  const referencesReady = !templatesLoading && !tasksLoading

  const referencedInputUrls = useMemo(
    () =>
      new Set(
        templates.flatMap((template) =>
          Array.isArray(template.images)
            ? template.images
                .map((url) => getComparableImageUrl('input', url))
                .filter((url): url is string => Boolean(url))
            : [],
        ),
      ),
    [templates],
  )

  const referencedGeneratedUrls = useMemo(() => {
    const urls = tasks.flatMap((task) => {
      if (Array.isArray(task.outputUrls) && task.outputUrls.length > 0) {
        return task.outputUrls
          .map((url) => getComparableImageUrl('generated', url))
          .filter((url): url is string => Boolean(url))
      }

      if (!task.outputUrl) {
        return []
      }

      const normalizedUrl = getComparableImageUrl('generated', task.outputUrl)
      return normalizedUrl ? [normalizedUrl] : []
    })

    return new Set(urls)
  }, [tasks])

  const resolveIsReferenced = (
    image: Pick<GalleryImageItem, 'url' | 'type'>,
  ): boolean => {
    if (!referencesReady) {
      return true
    }

    const comparableUrl = getComparableImageUrl(image.type, image.url)
    if (!comparableUrl) {
      return true
    }

    return image.type === 'input'
      ? referencedInputUrls.has(comparableUrl)
      : referencedGeneratedUrls.has(comparableUrl)
  }

  // isReferenced 由 fetchedImages + 引用集合派生，避免 fetch 闭包快照与引用加载完成的时序竞态
  const images = useMemo<GalleryImageItem[]>(
    () =>
      fetchedImages.map((image) => ({
        ...image,
        isReferenced: resolveIsReferenced(image),
      })),
    [fetchedImages, referencesReady, referencedInputUrls, referencedGeneratedUrls],
  )

  const fetchImages = async (): Promise<FetchedImage[] | null> => {
    setLoading(true)
    setImagesLoaded(false)
    setImagesLoadSucceeded(false)
    try {
      const res = await client.api.static.images.list.$get()
      const data = await res.json()
      if (data.success) {
        const nextImages = data.data as FetchedImage[]
        setFetchedImages(nextImages)
        setImagesLoadSucceeded(true)
        return nextImages
      }
    } catch (error) {
      console.error('Failed to fetch images', error)
    } finally {
      setLoading(false)
      setImagesLoaded(true)
    }

    return null
  }

  useEffect(() => {
    if (visible) {
      fetchImages()
    }
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
