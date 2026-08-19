import type { AppType } from '@/server'
import { PictureOutlined, UploadOutlined } from '@ant-design/icons'
import { Button, message, Upload } from 'antd'
import { hc } from 'hono/client'
import { useEffect, useRef } from 'react'
import { useRecentImages } from '../hooks/useRecentImages'
import { openGallery, type GalleryImageSelection } from './Gallery'
import { ImageCropModal } from './ImageCrop/ImageCropModal'
import { ImageUploadItem } from './ImageCrop/ImageUploadItem'
import { ImageDrawModal } from './ImageDraw/ImageDrawModal'
import { useImageEditUpload } from './ImageEdit/useImageEditUpload'

const client = hc<AppType>('/')

const MAX_IMAGES = 10

interface ImageUploadProps {
  value?: string[]
  onChange?: (urls: string[]) => void
  onUploadingChange?: (isUploading: boolean) => void
  onFirstImageRatio?: (ratio: string) => void
}

const ASPECT_RATIOS = [
  { label: '21:9', value: '21:9', ratio: 21 / 9 },
  { label: '2:1', value: '2:1', ratio: 2 / 1 },
  { label: '16:9', value: '16:9', ratio: 16 / 9 },
  { label: '4:3', value: '4:3', ratio: 4 / 3 },
  { label: '1:1', value: '1:1', ratio: 1 / 1 },
  { label: '3:4', value: '3:4', ratio: 3 / 4 },
  { label: '9:16', value: '9:16', ratio: 9 / 16 },
  { label: '1:2', value: '1:2', ratio: 1 / 2 },
  { label: '9:21', value: '9:21', ratio: 9 / 21 },
]

function getClosestAspectRatio(width: number, height: number) {
  const targetRatio = width / height
  let closest = ASPECT_RATIOS[0]
  let minDiff = Math.abs(targetRatio - closest.ratio)

  for (let i = 1; i < ASPECT_RATIOS.length; i++) {
    const diff = Math.abs(targetRatio - ASPECT_RATIOS[i].ratio)
    if (diff < minDiff) {
      closest = ASPECT_RATIOS[i]
      minDiff = diff
    }
  }
  return closest.value
}

export function ImageUpload({
  value = [],
  onChange,
  onUploadingChange,
  onFirstImageRatio,
}: ImageUploadProps) {
  const uploadingCountRef = useRef(0)
  const { addRecentImages } = useRecentImages()

  const latestValueRef = useRef(value)
  latestValueRef.current = value

  const handleUploadCountChange = (delta: number) => {
    const newCount = Math.max(0, uploadingCountRef.current + delta)
    uploadingCountRef.current = newCount
    onUploadingChange?.(newCount > 0)
  }

  const uploadImageBase64 = async (base64: string) => {
    const res = await client.api.static.images.upload.$post({
      json: { image: base64 },
    })
    const data = await res.json()

    if (!data.success || !('url' in data)) {
      throw new Error((data as any).error || '图片上传失败')
    }

    return data.url as string
  }

  const {
    cropTarget,
    drawTarget,
    openCrop,
    openDraw,
    closeEditor,
    handleEditConfirm,
  } = useImageEditUpload({
      latestValueRef,
      uploadImageBase64,
      handleUploadCountChange,
      onChange,
      addRecentImages,
    })

  const blobToBase64 = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('图片读取失败'))
      reader.readAsDataURL(blob)
    })

  const uploadImageFromUrl = async (url: string) => {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error('图片下载失败')
    }

    const blob = await response.blob()
    const base64 = await blobToBase64(blob)
    return uploadImageBase64(base64)
  }

  const handleUpload = (file: File) => {
    // 超出上限时直接忽略该文件（含正在上传中的数量，避免多选/连拖时超限）
    if (
      latestValueRef.current.length + uploadingCountRef.current >=
      MAX_IMAGES
    ) {
      message.warning(`最多支持 ${MAX_IMAGES} 张图片`)
      return Upload.LIST_IGNORE
    }

    handleUploadCountChange(1)
    const reader = new FileReader()
    reader.onload = async (e) => {
      const base64 = e.target?.result as string

      if (latestValueRef.current.length === 0 && onFirstImageRatio) {
        const img = new Image()
        img.onload = () => {
          const ratio = getClosestAspectRatio(img.width, img.height)
          onFirstImageRatio(ratio)
        }
        img.src = base64
      }

      try {
        const url = await uploadImageBase64(base64)
        const newUrls = [...latestValueRef.current, url].slice(0, MAX_IMAGES)
        latestValueRef.current = newUrls
        onChange?.(newUrls)
        addRecentImages(url)
        message.success('图片上传成功')
      } catch (error) {
        message.error(
          error instanceof Error ? error.message : '图片上传请求失败',
        )
      } finally {
        handleUploadCountChange(-1)
      }
    }
    reader.onerror = () => {
      message.error('图片读取失败')
      handleUploadCountChange(-1)
    }
    reader.readAsDataURL(file)
    return false
  }

  const handleUploadRef = useRef(handleUpload)
  handleUploadRef.current = handleUpload

  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      if (
        e.dataTransfer?.types &&
        Array.from(e.dataTransfer.types).includes('Files')
      ) {
        e.preventDefault()
        e.stopPropagation()
      }
    }

    const handleDrop = (e: DragEvent) => {
      if (
        e.dataTransfer?.types &&
        Array.from(e.dataTransfer.types).includes('Files')
      ) {
        e.preventDefault()
        e.stopPropagation()
        const files = e.dataTransfer?.files
        if (files && files.length > 0) {
          Array.from(files).forEach((file) => {
            if (file.type.startsWith('image/')) {
              handleUploadRef.current(file)
            }
          })
        }
      }
    }

    window.addEventListener('dragover', handleDragOver, { capture: true })
    window.addEventListener('drop', handleDrop, { capture: true })

    return () => {
      window.removeEventListener('dragover', handleDragOver, { capture: true })
      window.removeEventListener('drop', handleDrop, { capture: true })
    }
  }, [])

  const handleRemove = (indexToRemove: number) => {
    const newUrls = value.filter((_, i) => i !== indexToRemove)
    latestValueRef.current = newUrls
    onChange?.(newUrls)
  }

  return (
    <div>
      <div className="flex items-center gap-4">
        <Upload
          accept="image/jpeg,image/png,image/webp"
          showUploadList={false}
          beforeUpload={handleUpload}
          multiple
        >
          <Button icon={<UploadOutlined />}>拖入/选择本地图片</Button>
        </Upload>
        <Button
          icon={<PictureOutlined />}
          onClick={() => {
            openGallery({
              onSelect: async (images: GalleryImageSelection[]) => {
                if (images.length === 0) {
                  return
                }

                // 超出上限时只取剩余可添加的数量
                const remaining = MAX_IMAGES - latestValueRef.current.length
                if (remaining <= 0) {
                  message.warning(`最多支持 ${MAX_IMAGES} 张图片`)
                  return
                }
                const selected = images.slice(0, remaining)
                if (selected.length < images.length) {
                  message.warning(
                    `最多支持 ${MAX_IMAGES} 张图片，已自动截取前 ${selected.length} 张`,
                  )
                }

                if (latestValueRef.current.length === 0 && onFirstImageRatio) {
                  const img = new Image()
                  img.onload = () => {
                    const ratio = getClosestAspectRatio(img.width, img.height)
                    onFirstImageRatio(ratio)
                  }
                  img.src = selected[0].url
                }

                handleUploadCountChange(selected.length)
                try {
                  const processedUrls = await Promise.all(
                    selected.map(({ url, type }) =>
                      type === 'generated' ? uploadImageFromUrl(url) : url,
                    ),
                  )
                  const newUrls = [
                    ...latestValueRef.current,
                    ...processedUrls,
                  ].slice(0, MAX_IMAGES)
                  latestValueRef.current = newUrls
                  onChange?.(newUrls)
                  addRecentImages(processedUrls)
                } catch (error) {
                  message.error(
                    error instanceof Error ? error.message : '图库图片处理失败',
                  )
                } finally {
                  handleUploadCountChange(-selected.length)
                }
              },
            })
          }}
        >
          图库
        </Button>
      </div>
      {value.length > 0 && (
        <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
          {value.map((url, index) => (
            <ImageUploadItem
              key={`${url}-${index}`}
              url={url}
              index={index}
              onRemove={handleRemove}
              onCrop={openCrop}
              onDraw={openDraw}
            />
          ))}
        </div>
      )}
      <ImageCropModal
        open={!!cropTarget}
        src={cropTarget?.url || null}
        onCancel={closeEditor}
        onConfirm={handleEditConfirm}
      />
      <ImageDrawModal
        open={!!drawTarget}
        src={drawTarget?.url || null}
        onCancel={closeEditor}
        onConfirm={handleEditConfirm}
      />
    </div>
  )
}
