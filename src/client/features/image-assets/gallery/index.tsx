import { subscribeStorageEvent } from '@/client/service/storage-events'
import { AppThemeProvider } from '@/client/theme'
import { InboxOutlined } from '@ant-design/icons'
import { Modal, Spin, Tabs, message } from 'antd'
import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { registerImageDropTarget } from '../drop-targets'
import { usePendingImages } from '../pendingImages'
import { readImageBlob, uploadImageBase64 } from '../service'
import { MAX_VISIBLE_RECENT_IMAGES, useRecentImages } from '../useRecentImages'
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

let pendingUploadBatch = 0

async function uploadPendingImages(
  files: File[],
  skippedCount: number,
  refreshImages: () => void,
) {
  const key = `gallery-pending-upload-${++pendingUploadBatch}`
  const skipped = `筛选跳过 ${skippedCount} 个文件`
  if (files.length === 0) {
    message.warning({ key, content: `没有可上传的图片，${skipped}` })
    return
  }

  const urls: string[] = []
  let failedCount = 0
  let uploadError = ''
  const uploadProgress = () =>
    `已上传 ${urls.length}/${files.length} 张，${skipped}`
  const failureSummary = () => (failedCount > 0 ? `，失败 ${failedCount} 张` : '')
  const showProgress = (stage: string) =>
    message.loading({
      key,
      content: `${stage} · ${uploadProgress()}${failureSummary()}`,
      duration: 0,
    })

  showProgress('正在上传')
  try {
    for (const file of files) {
      try {
        urls.push(await uploadImageBase64(await readImageBlob(file)))
      } catch (error) {
        failedCount++
        uploadError ||= error instanceof Error ? error.message : '图片上传失败'
      }
      showProgress('正在上传')
    }

    if (urls.length === 0) {
      message.error({
        key,
        content: `${uploadProgress()}${failureSummary()}（${uploadError}）`,
      })
      return
    }

    showProgress('正在加入待使用')
    const addedCount = await usePendingImages.getState().add(urls)
    if (addedCount > 0) refreshImages()

    const duplicateCount = urls.length - addedCount
    const content = `已加入待使用 ${addedCount} 张，${skipped}，重复跳过 ${duplicateCount} 张${failureSummary()}`
    message.open({
      key,
      content: uploadError ? `${content}（${uploadError}）` : content,
      type: failedCount > 0 ? 'warning' : addedCount > 0 ? 'success' : 'info',
    })
  } catch (error) {
    const reason = error instanceof Error ? `（${error.message}）` : ''
    message.error({
      key,
      content: `加入待使用失败${reason} · ${uploadProgress()}${failureSummary()}`,
    })
  }
}

function GalleryModal({ visible, onClose, onSelect }: GalleryModalProps) {
  const [activeKey, setActiveKey] = useState('pending')
  const [selectedUrls, setSelectedUrls] = useState<string[]>([])
  const [selectedInputFolder, setSelectedInputFolder] = useState<string | null>(
    null,
  )
  const [dragging, setDragging] = useState(false)
  const [panel, setPanel] = useState<HTMLDivElement | null>(null)
  const { recentImages, removeRecentImages } = useRecentImages()
  const storedPendingUrls = usePendingImages((s) => s.urls)
  const loadPendingImages = usePendingImages((s) => s.load)
  const removePendingImages = usePendingImages((s) => s.remove)
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
    refreshImages,
    resolveImageType,
  } = useGalleryImages(visible)

  useLayoutEffect(() => {
    if (!visible || !panel) return

    return registerImageDropTarget({
      element: panel,
      setDragging,
      dropFiles: (files, skippedCount) =>
        void uploadPendingImages(files, skippedCount, refreshImages),
    })
  }, [visible, panel, refreshImages])

  useEffect(() => {
    if (!visible) return
    void loadPendingImages().catch((error) => {
      message.error(
        error instanceof Error ? error.message : '待使用图片加载失败',
      )
    })
    return subscribeStorageEvent('image.pending', () => {
      void loadPendingImages().catch((error) =>
        console.error('刷新待使用图片失败', error),
      )
    })
  }, [visible, loadPendingImages])

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

  const pendingUrls = useMemo(
    () => {
      const pendingUrlSet = new Set(storedPendingUrls)
      return images
        .filter(
          (image) =>
            image.type === 'input' && pendingUrlSet.has(image.url),
        )
        .map((image) => image.url)
    },
    [images, storedPendingUrls],
  )
  const pendingTabVisible =
    storedPendingUrls.length > 0 &&
    (!imagesLoadSucceeded || pendingUrls.length > 0)
  const currentActiveKey =
    activeKey === 'pending' && !pendingTabVisible ? 'recent' : activeKey

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
    const removedPendingUrls = urls.filter(
      (url) => storedPendingUrls.includes(url) && !existingUrlSet.has(url),
    )
    await removePendingImages(removedPendingUrls)

    setSelectedUrls((prev) =>
      prev.filter((url) => !urls.includes(url) || existingUrlSet.has(url)),
    )
  }

  return (
    <Modal
      title="选择图片"
      open={visible}
      panelRef={setPanel}
      onCancel={onClose}
      footer={
        referencesReady ? (
          <GalleryFooter
            activeKey={currentActiveKey}
            selectedUrls={selectedUrls}
            pendingUrls={pendingUrls}
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
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center rounded-lg bg-white/70">
          <div
            className="app-accent-outline flex items-center gap-3 rounded-lg border border-dashed bg-white px-5 py-4 text-base font-medium shadow-sm"
            role="status"
          >
            <InboxOutlined className="app-accent-text text-2xl" />
            松开鼠标，将图片加入待使用
          </div>
        </div>
      )}
      <Tabs
        activeKey={currentActiveKey}
        onChange={setActiveKey}
        items={[
          ...(pendingTabVisible
            ? [
                {
                  key: 'pending',
                  label: '待使用',
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
                      <GalleryImageGrid
                        urls={pendingUrls}
                        selectedUrls={selectedUrls}
                        onSelect={handleSelect}
                        onSelectionChange={setSelectedUrls}
                      />
                    ),
                },
              ]
            : []),
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
                  onSelectionChange={setSelectedUrls}
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
                  onSelectionChange={setSelectedUrls}
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

  const renderGallery = (visible: boolean) => {
    root.render(
      <AppThemeProvider>
        <GalleryModal
          visible={visible}
          onClose={visible ? handleClose : destroy}
          onSelect={options.onSelect}
        />
      </AppThemeProvider>,
    )
  }

  const handleClose = () => {
    renderGallery(false)
    setTimeout(destroy, 300)
  }

  const destroy = () => {
    root.unmount()
    if (container.parentNode) {
      container.parentNode.removeChild(container)
    }
  }

  renderGallery(true)
}
