import { CloseCircleFilled, UploadOutlined } from '@ant-design/icons'
import { useLocalStorageState } from 'ahooks'
import { Image as AntImage, Button, message, Upload } from 'antd'
import { hc } from 'hono/client'
import { useEffect, useRef, useState } from 'react'
import type { AppType } from '../../../../server'

const client = hc<AppType>('/')

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
  { label: '9:21', value: '9:21', ratio: 9 / 21 }
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

const LOCAL_STORAGE_KEY = 'recent_uploaded_images'

function RecentImages({
  recentImages,
  currentValue,
  onSelect,
  onRemove
}: {
  recentImages: string[]
  currentValue: string[]
  onSelect: (url: string) => void
  onRemove: (url: string) => void
}) {
  const displayImages = recentImages
    .filter((url) => !currentValue.includes(url))
    .slice(0, 3)

  if (displayImages.length === 0) return null

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-slate-400">最近:</span>
      {displayImages.map((url) => (
        <img
          key={url}
          src={url}
          alt="recent"
          className="h-8 w-8 cursor-pointer rounded border border-slate-200 object-cover transition-colors hover:border-blue-500"
          onClick={() => onSelect(url)}
          onError={() => onRemove(url)}
        />
      ))}
    </div>
  )
}

export function ImageUpload({
  value = [],
  onChange,
  onUploadingChange,
  onFirstImageRatio
}: ImageUploadProps) {
  const [_, setUploadingCount] = useState(0)
  const [recentImages = [], setRecentImages] = useLocalStorageState<string[]>(
    LOCAL_STORAGE_KEY,
    { defaultValue: [] }
  )

  const addRecentImage = (url: string) => {
    setRecentImages((prev = []) => {
      const newRecent = [url, ...prev.filter((u) => u !== url)].slice(0, 10)
      return newRecent
    })
  }

  const latestValueRef = useRef(value)
  latestValueRef.current = value

  const handleUploadCountChange = (delta: number) => {
    setUploadingCount((c) => {
      const newCount = Math.max(0, c + delta)
      onUploadingChange?.(newCount > 0)
      return newCount
    })
  }

  const handleUpload = (file: File) => {
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

      handleUploadCountChange(1)
      try {
        const res = await client.api.static.images.upload.$post({
          json: { image: base64 }
        })
        const data = await res.json()
        if (data.success && 'url' in data) {
          const url = data.url as string
          const newUrls = [...latestValueRef.current, url]
          latestValueRef.current = newUrls
          onChange?.(newUrls)
          addRecentImage(url)
          message.success('图片上传成功')
        } else {
          message.error((data as any).error || '图片上传失败')
        }
      } catch (error) {
        message.error('图片上传请求失败')
      } finally {
        handleUploadCountChange(-1)
      }
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
          <Button icon={<UploadOutlined />}>拖入/选择图片</Button>
        </Upload>
        <RecentImages
          recentImages={recentImages}
          currentValue={value}
          onSelect={(url) => {
            if (latestValueRef.current.length === 0 && onFirstImageRatio) {
              const img = new Image()
              img.onload = () => {
                const ratio = getClosestAspectRatio(img.width, img.height)
                onFirstImageRatio(ratio)
              }
              img.src = url
            }
            const newUrls = [...latestValueRef.current, url]
            latestValueRef.current = newUrls
            onChange?.(newUrls)
            addRecentImage(url)
          }}
          onRemove={(url) => {
            setRecentImages((prev = []) => prev.filter((u) => u !== url))
          }}
        />
      </div>
      {value.length > 0 && (
        <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
          {value.map((url, index) => (
            <div
              key={index}
              className="relative shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 shadow-sm"
              style={{ width: '80px', height: '120px' }}
            >
              <div
                className="absolute top-0 right-1 z-10 cursor-pointer text-xl text-red-500 drop-shadow-md transition-all"
                onClick={(e) => {
                  e.stopPropagation()
                  handleRemove(index)
                }}
              >
                <CloseCircleFilled />
              </div>
              <AntImage
                src={url}
                alt={`preview-${index}`}
                width={80}
                height={120}
                className="object-cover"
                preview={{ src: url }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
