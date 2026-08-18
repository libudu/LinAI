import { Alert, Button, message, Modal, Spin } from 'antd'
import { useEffect, useRef, useState } from 'react'
import ReactCrop, { type PixelCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { cropImage } from './cropImage'

const CROP_BLEED = 24
const MAX_ZOOM = 8
const MAX_DISPLAY_EDGE = 4096

interface ImageSize {
  width: number
  height: number
}

interface ImageCropModalProps {
  open: boolean
  src: string | null
  onCancel: () => void
  onConfirm: (croppedDataUrl: string) => Promise<void>
}

function createFullCrop({ width, height }: ImageSize): PixelCrop {
  return {
    unit: 'px',
    x: 0,
    y: 0,
    width,
    height,
  }
}

export function ImageCropModal({
  open,
  src,
  onCancel,
  onConfirm,
}: ImageCropModalProps) {
  const imageRef = useRef<HTMLImageElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [crop, setCrop] = useState<PixelCrop>()
  const [initialDisplaySize, setInitialDisplaySize] = useState<ImageSize>()
  const [displaySize, setDisplaySize] = useState<ImageSize>()
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!open || !src) {
      setObjectUrl(null)
      setCrop(undefined)
      setInitialDisplaySize(undefined)
      setDisplaySize(undefined)
      setLoadError(null)
      return
    }

    const controller = new AbortController()
    let nextObjectUrl: string | null = null

    setLoading(true)
    setLoadError(null)
    setCrop(undefined)
    setInitialDisplaySize(undefined)
    setDisplaySize(undefined)
    setObjectUrl(null)

    fetch(src, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error('图片加载失败')
        }
        return response.blob()
      })
      .then((blob) => {
        nextObjectUrl = URL.createObjectURL(blob)
        setObjectUrl(nextObjectUrl)
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
        setLoadError(error instanceof Error ? error.message : '图片加载失败')
        setLoading(false)
      })

    return () => {
      controller.abort()
      if (nextObjectUrl) {
        URL.revokeObjectURL(nextObjectUrl)
      }
    }
  }, [open, src])

  const handleReset = () => {
    if (initialDisplaySize) {
      setDisplaySize(initialDisplaySize)
      setCrop(createFullCrop(initialDisplaySize))
      requestAnimationFrame(() => {
        viewportRef.current?.scrollTo({ left: 0, top: 0 })
      })
    }
  }

  const centerCropInViewport = (nextCrop: PixelCrop) => {
    requestAnimationFrame(() => {
      const viewport = viewportRef.current
      const image = imageRef.current
      if (!viewport || !image) {
        return
      }

      const viewportRect = viewport.getBoundingClientRect()
      const imageRect = image.getBoundingClientRect()
      viewport.scrollTo({
        left:
          viewport.scrollLeft +
          imageRect.left -
          viewportRect.left +
          nextCrop.x +
          nextCrop.width / 2 -
          viewport.clientWidth / 2,
        top:
          viewport.scrollTop +
          imageRect.top -
          viewportRect.top +
          nextCrop.y +
          nextCrop.height / 2 -
          viewport.clientHeight / 2,
      })
    })
  }

  const handleCropComplete = (completedCrop: PixelCrop) => {
    const viewport = viewportRef.current
    const image = imageRef.current
    if (
      !viewport ||
      !image ||
      !initialDisplaySize ||
      completedCrop.width <= 0 ||
      completedCrop.height <= 0
    ) {
      return
    }

    const availableWidth = Math.max(1, viewport.clientWidth - CROP_BLEED * 2)
    const availableHeight = Math.max(1, viewport.clientHeight - CROP_BLEED * 2)
    const desiredScale = Math.min(
      availableWidth / completedCrop.width,
      availableHeight / completedCrop.height,
    )
    const currentWidth = image.width
    const currentHeight = image.height
    const minScale = Math.max(
      initialDisplaySize.width / currentWidth,
      initialDisplaySize.height / currentHeight,
    )
    const maxScale = Math.min(
      (initialDisplaySize.width * MAX_ZOOM) / currentWidth,
      (initialDisplaySize.height * MAX_ZOOM) / currentHeight,
      MAX_DISPLAY_EDGE / currentWidth,
      MAX_DISPLAY_EDGE / currentHeight,
    )
    const scale = Math.max(minScale, Math.min(desiredScale, maxScale))

    // 小幅变化不重新布局，避免松开鼠标时画面产生无意义的抖动。
    if (scale > 0.9 && scale < 1.1) {
      centerCropInViewport(completedCrop)
      return
    }

    const nextSize = {
      width: Math.round(currentWidth * scale),
      height: Math.round(currentHeight * scale),
    }
    const scaleX = nextSize.width / currentWidth
    const scaleY = nextSize.height / currentHeight
    const nextCrop: PixelCrop = {
      unit: 'px',
      x: completedCrop.x * scaleX,
      y: completedCrop.y * scaleY,
      width: completedCrop.width * scaleX,
      height: completedCrop.height * scaleY,
    }

    setDisplaySize(nextSize)
    setCrop(nextCrop)
    centerCropInViewport(nextCrop)
  }

  const handleConfirm = async () => {
    if (!imageRef.current || !crop) {
      return
    }

    setConfirming(true)
    try {
      const croppedDataUrl = await cropImage(imageRef.current, crop)
      await onConfirm(croppedDataUrl)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '图片裁剪失败')
    } finally {
      setConfirming(false)
    }
  }

  return (
    <Modal
      title="裁剪图片"
      open={open}
      width={900}
      destroyOnHidden
      maskClosable={!confirming}
      keyboard={!confirming}
      closable={!confirming}
      onCancel={() => {
        if (!confirming) {
          onCancel()
        }
      }}
      footer={
        <div className="flex justify-between">
          <Button disabled={confirming} onClick={onCancel}>
            取消
          </Button>
          <div className="flex gap-2">
            <Button
              disabled={confirming || !crop || !!loadError}
              onClick={handleReset}
            >
              还原
            </Button>
            <Button
              type="primary"
              loading={confirming}
              disabled={!crop || !!loadError}
              onClick={handleConfirm}
            >
              提交
            </Button>
          </div>
        </div>
      }
    >
      <div
        ref={viewportRef}
        className="max-h-[min(60vh,560px)] min-h-72 overflow-auto rounded-lg bg-black/80 p-4"
      >
        {loadError ? (
          <div className="flex min-h-64 items-center justify-center">
            <Alert type="error" showIcon message={loadError} />
          </div>
        ) : objectUrl ? (
          <div className="flex min-h-64 w-max min-w-full items-center justify-center">
            <ReactCrop
              crop={crop}
              keepSelection
              disabled={confirming}
              minWidth={20}
              minHeight={20}
              ruleOfThirds
              ariaLabels={{
                cropArea: '图片裁剪区域',
                nwDragHandle: '左上裁剪控制点',
                nDragHandle: '上方裁剪控制点',
                neDragHandle: '右上裁剪控制点',
                eDragHandle: '右侧裁剪控制点',
                seDragHandle: '右下裁剪控制点',
                sDragHandle: '下方裁剪控制点',
                swDragHandle: '左下裁剪控制点',
                wDragHandle: '左侧裁剪控制点',
              }}
              onChange={(nextCrop) => setCrop(nextCrop)}
              onComplete={handleCropComplete}
            >
              <img
                ref={imageRef}
                src={objectUrl}
                alt="待裁剪图片"
                className={
                  displaySize
                    ? 'object-contain'
                    : 'max-h-[min(60vh,560px)]! max-w-[min(100%,720px)]! object-contain'
                }
                style={
                  displaySize
                    ? {
                        width: displaySize.width,
                        height: displaySize.height,
                        maxWidth: 'none',
                        maxHeight: 'none',
                      }
                    : undefined
                }
                onLoad={(event) => {
                  const nextSize = {
                    width: event.currentTarget.width,
                    height: event.currentTarget.height,
                  }
                  setInitialDisplaySize(nextSize)
                  setDisplaySize(nextSize)
                  setCrop(createFullCrop(nextSize))
                  setLoading(false)
                }}
                onError={() => {
                  setLoadError('图片加载失败')
                  setLoading(false)
                }}
              />
            </ReactCrop>
          </div>
        ) : loading ? (
          <div className="flex min-h-64 items-center justify-center">
            <Spin size="large" />
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
