export function readFileAsBase64(file: File): Promise<string> {
  const { promise, resolve, reject } = Promise.withResolvers<string>()
  const reader = new FileReader()
  reader.onload = () => resolve(reader.result as string)
  reader.onerror = () => reject(new Error('图片读取失败'))
  reader.readAsDataURL(file)
  return promise
}

export function isUploadedImageUrl(url: string): boolean {
  return url.startsWith('/api/static/images/input/')
}
