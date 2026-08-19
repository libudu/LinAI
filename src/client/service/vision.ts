import { relayRequest } from './relay'

export type VisionContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export interface VisionMessage {
  role: string
  content: string | VisionContentPart[]
}

export interface VisionChatCompletion {
  choices?: Array<{
    message?: {
      content?: unknown
    }
  }>
}

export const visionChatCompletion = (options: {
  messages: VisionMessage[]
  temperature?: number
}): Promise<VisionChatCompletion> =>
  relayRequest<VisionChatCompletion>('vision.openai', {
    path: '/chat/completions',
    body: {
      messages: options.messages,
      temperature: options.temperature,
      stream: false,
    },
  })

const blobToDataUrl = (blob: Blob): Promise<string> => {
  const { promise, resolve, reject } = Promise.withResolvers<string>()
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result))
  reader.onerror = () => reject(new Error('本地图片读取失败'))
  reader.readAsDataURL(blob)
  return promise
}

/** 将上游无法访问的本地上传图片转为 data URL；远程 URL 原样保留 */
export const normalizeVisionImageUrl = async (rawUrl: string) => {
  const url = rawUrl.trim()
  if (!url) throw new Error('图片地址为空')
  if (url.startsWith('data:image/')) return url

  let parsed: URL
  try {
    parsed = new URL(url, window.location.href)
  } catch {
    throw new Error('图片地址无效')
  }

  const isLocalInput =
    parsed.origin === window.location.origin &&
    parsed.pathname.startsWith('/api/static/images/input/')
  if (!isLocalInput) return url

  const response = await fetch(parsed.toString())
  if (!response.ok) {
    throw new Error(`本地图片读取失败（${response.status}）`)
  }
  return await blobToDataUrl(await response.blob())
}

export const extractVisionText = (data: VisionChatCompletion): string => {
  const content = data.choices?.[0]?.message?.content
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''

  return content
    .filter(
      (item): item is { type: 'text'; text: string } =>
        typeof item === 'object' &&
        item !== null &&
        (item as { type?: unknown }).type === 'text' &&
        typeof (item as { text?: unknown }).text === 'string',
    )
    .map((item) => item.text.trim())
    .filter(Boolean)
    .join('\n')
}
