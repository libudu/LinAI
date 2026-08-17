import { Modal, Spin, Tabs } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  MAX_VISIBLE_RECENT_IMAGES,
  useRecentImages,
} from '../../hooks/useRecentImages'
import type { GalleryDeleteSuccessPayload } from './Footer'
import { GalleryFooter } from './Footer'
import { GalleryImageGrid } from './GalleryImageGrid'
import { InputImageGallery } from './InputImageGallery'
import {
  type GalleryImageItem,
  normalizeComparableUrl,
  useGalleryImages,
} from './useGalleryImages'

interface GalleryModalProps {
  visible: boolean
  onClose: () => void
  onSelect: (images: GalleryImageSelection[]) => void
}

export type GalleryImageSelection = Pick<GalleryImageItem, 'url' | 'type'>

function GalleryModal({ visible, onClose, onSelect }: GalleryModalProps) {
  const [activeKey, setActiveKey] = useState('recent')
  const [selectedUrls, setSelectedUrls] = useState<string[]>([])
  const [selectedInputFolder, setSelectedInputFolder] = useState<string | null>(
    null,
  )
  const { recentImages, removeRecentImages } = useRecentImages()
  const {
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
  } = useGalleryImages(visible)

  const validRecentImages = useMemo(() => {
    if (!imagesLoadSucceeded) {
      return []
    }

    return recentImages
      .filter((url) =>
        availableComparableUrlSet.has(normalizeComparableUrl(url)),
      )
      .slice(0, MAX_VISIBLE_RECENT_IMAGES)
  }, [availableComparableUrlSet, imagesLoadSucceeded, recentImages])

  const invalidRecentImages = useMemo(() => {
    if (!imagesLoadSucceeded) {
      return []
    }

    return recentImages.filter(
      (url) => !availableComparableUrlSet.has(normalizeComparableUrl(url)),
    )
  }, [availableComparableUrlSet, imagesLoadSucceeded, recentImages])

  const selectedInputFolderView = useMemo(
    () =>
      inputFolderViews.find((folder) => folder.folder === selectedInputFolder),
    [inputFolderViews, selectedInputFolder],
  )

  useEffect(() => {
    if (invalidRecentImages.length > 0) {
      removeRecentImages(invalidRecentImages)
      const invalidUrlSet = new Set(invalidRecentImages)
      setSelectedUrls((prev) => prev.filter((url) => !invalidUrlSet.has(url)))
    }
  }, [invalidRecentImages, removeRecentImages])

  useEffect(() => {
    if (
      selectedInputFolder &&
      imagesLoadSucceeded &&
      !templatesLoading &&
      !selectedInputFolderView
    ) {
      setSelectedInputFolder(null)
    }
  }, [
    imagesLoadSucceeded,
    selectedInputFolder,
    selectedInputFolderView,
    templatesLoading,
  ])

  const handleSelect = (url: string) => {
    setSelectedUrls((prev) =>
      prev.includes(url) ? prev.filter((item) => item !== url) : [...prev, url],
    )
  }

  const handleRemoveRecentImage = (url: string) => {
    removeRecentImages(url)
    setSelectedUrls((prev) => prev.filter((item) => item !== url))
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

  const handleDeleteImages = async ({ urls }: GalleryDeleteSuccessPayload) => {
    const nextImages = await fetchImages()
    if (!nextImages) {
      return
    }
    const existingUrlSet = new Set(nextImages.map((image) => image.url))

    setSelectedUrls((prev) =>
      prev.filter((url) => !urls.includes(url) || existingUrlSet.has(url)),
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
            children:
              loading || !imagesLoaded ? (
                <div className="p-8 text-center">
                  <Spin />
                </div>
              ) : !imagesLoadSucceeded ? (
                <div className="p-8 text-center text-slate-400">
                  图片加载失败，请关闭图库后重试
                </div>
              ) : (
                <GalleryImageGrid
                  urls={validRecentImages}
                  selectedUrls={selectedUrls}
                  unreferencedUrls={unreferencedUrls}
                  onSelect={handleSelect}
                  onImageError={handleRemoveRecentImage}
                  onRemove={handleRemoveRecentImage}
                />
              ),
          },
          {
            key: 'input',
            label: '输入图片',
            children:
              loading || !imagesLoaded || !referencesReady ? (
                <div className="p-8 text-center">
                  <Spin />
                </div>
              ) : !imagesLoadSucceeded ? (
                <div className="p-8 text-center text-slate-400">
                  图片加载失败，请关闭图库后重试
                </div>
              ) : (
                <InputImageGallery
                  folders={inputFolderViews}
                  rootImageUrls={rootInputImageUrls}
                  selectedFolder={selectedInputFolder}
                  selectedUrls={selectedUrls}
                  unreferencedUrls={unreferencedUrls}
                  onSelectFolder={setSelectedInputFolder}
                  onSelectImage={handleSelect}
                />
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
                <GalleryImageGrid
                  urls={generatedImageUrls}
                  selectedUrls={selectedUrls}
                  unreferencedUrls={unreferencedUrls}
                  onSelect={handleSelect}
                />
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
