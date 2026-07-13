import { Modal, Spin, Tabs } from 'antd'
import { hc } from 'hono/client'
import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { AppType } from '../../../../../server'
import {
  GENERATED_IMAGES_API_PATH,
  INPUT_IMAGES_API_PATH,
} from '../../../../../server/common/static/enum'
import { useRecentImages } from '../../../../hooks/useRecentImages'
import { useTasks } from '../../../../hooks/useTasks'
import { useTemplates } from '../../../../hooks/useTemplates'
import type { GalleryDeleteSuccessPayload } from './Footer'
import { GalleryFooter } from './Footer'

const client = hc<AppType>('/')

interface GalleryModalProps {
  visible: boolean
  onClose: () => void
  onSelect: (images: GalleryImageSelection[]) => void
}

type ImageItem = {
  url: string
  type: 'input' | 'generated'
  createdAt: number
  isReferenced: boolean
}

export type GalleryImageSelection = Pick<ImageItem, 'url' | 'type'>

function GalleryModal({ visible, onClose, onSelect }: GalleryModalProps) {
  const [activeKey, setActiveKey] = useState('recent')
  const [images, setImages] = useState<ImageItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedUrls, setSelectedUrls] = useState<string[]>([])

  const { recentImages } = useRecentImages()
  const { data: templates = [], loading: templatesLoading } = useTemplates()
  const { data: tasks = [], loading: tasksLoading } = useTasks()

  const referencesReady = !templatesLoading && !tasksLoading
  const normalizeComparableUrl = (url: string) =>
    url
      .replace(/^https?:\/\/[^/]+/i, '')
      .split('?')[0]
      .split('#')[0]
      .trim()

  const getComparableImageUrl = (
    type: ImageItem['type'],
    url: string,
  ): string | null => {
    const apiPath =
      type === 'input' ? INPUT_IMAGES_API_PATH : GENERATED_IMAGES_API_PATH
    const normalizedUrl = normalizeComparableUrl(url)

    if (!normalizedUrl.startsWith(`${apiPath}/`)) {
      return null
    }

    return normalizedUrl
  }

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

  const imageByUrl = useMemo(
    () => new Map(images.map((image) => [image.url, image])),
    [images],
  )

  const selectionOrderMap = useMemo(
    () => new Map(selectedUrls.map((url, index) => [url, index + 1])),
    [selectedUrls],
  )

  useEffect(() => {
    if (visible && referencesReady) {
      fetchImages()
    }
  }, [visible, referencesReady])

  useEffect(() => {
    setImages((prev) =>
      prev.map((image) => ({
        ...image,
        isReferenced: resolveIsReferenced(image),
      })),
    )
  }, [referencesReady, referencedInputUrls, referencedGeneratedUrls])

  const resolveIsReferenced = (
    image: Pick<ImageItem, 'url' | 'type'>,
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

  const fetchImages = async (): Promise<ImageItem[]> => {
    setLoading(true)
    try {
      const res = await client.api.static.images.list.$get()
      const data = await res.json()
      if (data.success) {
        const nextImages = (
          data.data as Array<Omit<ImageItem, 'isReferenced'>>
        ).map((image) => ({
          ...image,
          isReferenced: resolveIsReferenced(image),
        }))
        setImages(nextImages)
        return nextImages
      }
    } catch (e) {
      console.error('Failed to fetch images', e)
    } finally {
      setLoading(false)
    }

    return []
  }

  const handleSelect = (url: string) => {
    setSelectedUrls((prev) =>
      prev.includes(url) ? prev.filter((item) => item !== url) : [...prev, url],
    )
  }

  const handleConfirm = () => {
    if (selectedUrls.length === 0) {
      return
    }

    onSelect(
      selectedUrls.map((url) => ({
        url,
        type: resolveImageType(url) ?? 'input',
      })),
    )
    onClose()
  }

  const resolveImageType = (url: string): ImageItem['type'] | undefined => {
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
  const handleDeleteImages = async ({ urls }: GalleryDeleteSuccessPayload) => {
    const nextImages = await fetchImages()
    const existingUrlSet = new Set(nextImages.map((image) => image.url))

    setSelectedUrls((prev) =>
      prev.filter((url) => !urls.includes(url) || existingUrlSet.has(url)),
    )
  }

  const renderImageGrid = (urls: string[]) => {
    if (urls.length === 0) {
      return <div className="p-8 text-center text-slate-400">暂无图片</div>
    }
    return (
      <div className="grid max-h-[60vh] grid-cols-3 gap-4 overflow-y-auto p-2 md:grid-cols-4 lg:grid-cols-5">
        {urls.map((url, i) =>
          (() => {
            const order = selectionOrderMap.get(url)
            const selected = typeof order === 'number'

            return (
              <div
                key={`${url}-${i}`}
                className={`group relative aspect-square cursor-pointer overflow-hidden rounded-lg border-2 bg-slate-100 transition-all ${
                  selected
                    ? 'border-blue-500 shadow-[0_0_0_2px_rgba(59,130,246,0.15)]'
                    : 'border-transparent hover:border-blue-500'
                }`}
                onClick={() => handleSelect(url)}
              >
                <img
                  src={`${url}${url.includes('?') ? '&' : '?'}thumb=true`}
                  alt="gallery item"
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
                {referencesReady &&
                  imageByUrl.get(url)?.isReferenced === false && (
                    <div className="absolute left-1 top-1 z-10 rounded bg-red-500 px-2 py-0.5 text-xs text-white shadow-sm">
                      无引用
                    </div>
                  )}
                {/* Edit button — appears on hover */}
                <div

                  className={`absolute inset-0 flex items-center justify-center transition-colors ${
                    selected ? 'bg-blue-500/45' : 'bg-black/0 hover:bg-black/5'
                  }`}
                >
                  {selected && (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-semibold text-blue-600 shadow-sm">
                      {order}
                    </div>
                  )}
                </div>
              </div>
            )
          })(),
        )}
      </div>
    )
  }

  return (
    <Modal
      title="选择图片"
      open={visible}
      onCancel={onClose}
      footer={
        referencesReady ? (
          <GalleryFooter
            activeKey={activeKey}
            selectedUrls={selectedUrls}
            images={images}
            onCancel={onClose}
            onConfirm={handleConfirm}
            onDelete={handleDeleteImages}
          />
        ) : null
      }
      width={800}
      destroyOnHidden
    >
      <Tabs
        activeKey={activeKey}
        onChange={setActiveKey}
        items={[
          {
            key: 'recent',
            label: '最近使用',
            children: renderImageGrid(recentImages),
          },
          {
            key: 'input',
            label: '输入图片',
            children:
              loading || !referencesReady ? (
                <div className="p-8 text-center">
                  <Spin />
                </div>
              ) : (
                renderImageGrid(
                  images
                    .filter((img) => img.type === 'input')
                    .map((img) => img.url),
                )
              ),
          },
          {
            key: 'generated',
            label: '生成图片',
            children:
              loading || !referencesReady ? (
                <div className="p-8 text-center">
                  <Spin />
                </div>
              ) : (
                renderImageGrid(
                  images
                    .filter((img) => img.type === 'generated')
                    .map((img) => img.url),
                )
              ),
          },
        ]}
      />
    </Modal>
  )
}

export function openGallery(options: {
  onSelect: (images: GalleryImageSelection[]) => void
}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  const handleClose = () => {
    root.render(
      <GalleryModal
        visible={false}
        onClose={destroy}
        onSelect={options.onSelect}
      />,
    )
    setTimeout(destroy, 300)
  }

  const destroy = () => {
    root.unmount()
    if (container.parentNode) {
      container.parentNode.removeChild(container)
    }
  }

  root.render(
    <GalleryModal
      visible={true}
      onClose={handleClose}
      onSelect={options.onSelect}
    />,
  )
}
