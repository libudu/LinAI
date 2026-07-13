/**
 * Check if an HTMLImageElement has any transparent (alpha < 255) pixels.
 */
export function hasTransparentPixels(img: HTMLImageElement): Promise<boolean> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      resolve(false)
      return
    }
    ctx.drawImage(img, 0, 0)
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 255) {
        resolve(true)
        return
      }
    }
    resolve(false)
  })
}

/**
 * Fetch an image URL and return its content as a base64 data URL.
 */
export async function fetchImageAsBase64(url: string): Promise<string> {
  const resp = await fetch(url)
  const blob = await resp.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(blob)
  })
}
