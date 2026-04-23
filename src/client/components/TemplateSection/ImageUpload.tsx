import { useState } from 'react'
import { UploadOutlined } from '@ant-design/icons'
import { Button, message, Upload } from 'antd'
import { hc } from 'hono/client'
import type { AppType } from '../../../server'

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

export function ImageUpload({
  value = [],
  onChange,
  onUploadingChange,
  onFirstImageRatio
}: ImageUploadProps) {
  const [uploadingCount, setUploadingCount] = useState(0)

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

      if (value.length === 0 && onFirstImageRatio) {
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
          onChange?.([...value, data.url as string])
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

  return (
    <div>
      <Upload
        accept="image/*"
        showUploadList={false}
        beforeUpload={handleUpload}
        multiple
      >
        <Button icon={<UploadOutlined />}>选择多张图片</Button>
      </Upload>
      {value.length > 0 && (
        <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
          {value.map((url, index) => (
            <div
              key={index}
              className="shrink-0 rounded-lg overflow-hidden border border-slate-200 shadow-sm bg-slate-100"
              style={{ width: '80px', height: '120px' }}
            >
              <img
                src={url}
                alt={`preview-${index}`}
                className="w-full h-full object-cover"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
