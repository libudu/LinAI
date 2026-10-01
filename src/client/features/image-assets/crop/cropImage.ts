import type { PixelCrop } from 'react-image-crop'

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('裁剪结果读取失败'))
    reader.readAsDataURL(blob)
  })
}

export async function cropImage(
  image: HTMLImageElement,
  crop: PixelCrop,
): Promise<string> {
  if (crop.width <= 0 || crop.height <= 0) {
    throw new Error('请选择有效的裁剪区域')
  }

  const displayedWidth = image.width
  const displayedHeight = image.height
  if (!displayedWidth || !displayedHeight) {
    throw new Error('无法读取图片显示尺寸')
  }

  const scaleX = image.naturalWidth / displayedWidth
  const scaleY = image.naturalHeight / displayedHeight
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(crop.width * scaleX))
  canvas.height = Math.max(1, Math.round(crop.height * scaleY))

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('无法创建图片裁剪画布')
  }

  context.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    0,
    0,
    canvas.width,
    canvas.height,
  )

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) {
        resolve(result)
      } else {
        reject(new Error('图片裁剪导出失败'))
      }
    }, 'image/png')
  })

  return blobToDataUrl(blob)
}
