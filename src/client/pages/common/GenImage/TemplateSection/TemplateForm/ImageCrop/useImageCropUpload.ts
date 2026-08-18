import { message } from 'antd'
import { useState, type MutableRefObject } from 'react'

export interface CropTarget {
  index: number
  url: string
}

interface UseImageCropUploadOptions {
  latestValueRef: MutableRefObject<string[]>
  uploadImageBase64: (base64: string) => Promise<string>
  handleUploadCountChange: (delta: number) => void
  onChange?: (urls: string[]) => void
  addRecentImages: (urls: string | string[]) => void
}

export function useImageCropUpload({
  latestValueRef,
  uploadImageBase64,
  handleUploadCountChange,
  onChange,
  addRecentImages,
}: UseImageCropUploadOptions) {
  const [cropTarget, setCropTarget] = useState<CropTarget | null>(null)

  const handleCropConfirm = async (croppedDataUrl: string) => {
    const target = cropTarget
    if (!target) {
      throw new Error('未找到需要裁剪的图片')
    }

    handleUploadCountChange(1)
    try {
      const newUrl = await uploadImageBase64(croppedDataUrl)
      const currentUrls = latestValueRef.current

      if (
        target.index < 0 ||
        target.index >= currentUrls.length ||
        currentUrls[target.index] !== target.url
      ) {
        throw new Error('图片列表已变化，请重新裁剪')
      }

      const newUrls = [...currentUrls]
      newUrls[target.index] = newUrl
      latestValueRef.current = newUrls
      onChange?.(newUrls)
      addRecentImages(newUrl)
      setCropTarget(null)
      message.success('图片裁剪成功')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '图片裁剪失败')
    } finally {
      handleUploadCountChange(-1)
    }
  }

  return {
    cropTarget,
    openCrop: setCropTarget,
    closeCrop: () => setCropTarget(null),
    handleCropConfirm,
  }
}
