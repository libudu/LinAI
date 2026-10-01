import { rpcResult } from '@/client/service/http'
import type { AppType } from '@/server'
import { hc } from 'hono/client'

const client = hc<AppType>('/')

export const readImageBlob = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(blob)
  })

export async function uploadImageBase64(image: string) {
  const result = await rpcResult(
    client.api.static.images.upload.$post({ json: { image } }),
  )
  return result.url
}

/** 生成图转为参考图，沿用输入图片压缩和去重规则。 */
export async function uploadImageFromUrl(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error('图片下载失败')
  return uploadImageBase64(await readImageBlob(await response.blob()))
}
