import fs from 'fs-extra'
import OpenAI from 'openai'
import { GptImageQuality, GptImageSize } from './enum'

// Venice 特殊接入点适配（https://docs.venice.ai）：
// baseUrl 主机为 api.venice.ai 时（判断见 enum.ts 的 isVeniceEndpoint）
// 绕过 OpenAI SDK，直接请求 Venice 原生接口：
// - 无参考图走 /api/v1/image/generate（JSON 响应，images 为 base64 数组）
// - 有参考图走 /api/v1/image/multi-edit（成功响应直接是图片文件流）
const GENERATE_PATH = '/api/v1/image/generate'
const MULTI_EDIT_PATH = '/api/v1/image/multi-edit'

// Venice multi-edit 支持的宽高比
// （https://docs.venice.ai/api-reference/endpoint/image/multi-edit）
const VENICE_ASPECT_RATIOS = [
  'auto',
  '1:1',
  '3:2',
  '16:9',
  '21:9',
  '9:16',
  '2:3',
  '3:4',
  '4:5',
]

// Venice 编辑类模型的命名约定为「生成模型名 + -edit」
// （qwen-image-3 → qwen-image-3-edit、gpt-image-2 → gpt-image-2-edit），
// 接入点配置编辑模型 ID 时，无参考图的文生图请求需去掉后缀还原为生成模型
function toVeniceGenerateModelId(modelId: string): string {
  return modelId.replace(/-edit$/, '')
}

async function postVenice(
  apiKey: string,
  url: string,
  body: Record<string, unknown>,
): Promise<OpenAI.Images.ImagesResponse> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  // multi-edit 成功时直接返回图片文件流，转成 ImagesResponse 结构统一后续处理
  const contentType = response.headers.get('content-type') || ''
  if (response.ok && contentType.startsWith('image/')) {
    const buffer = Buffer.from(await response.arrayBuffer())
    return {
      created: Math.floor(Date.now() / 1000),
      data: [{ b64_json: buffer.toString('base64') }],
    } as OpenAI.Images.ImagesResponse
  }
  const json: any = await response.json().catch(() => null)
  if (!response.ok) {
    const message = json?.error?.message || json?.message
    throw new Error(
      typeof message === 'string' ? message : `HTTP ${response.status}`,
    )
  }
  // generate 契约：{ images: string[] }（base64 数组）
  if (Array.isArray(json?.images)) {
    return {
      created: Math.floor(Date.now() / 1000),
      data: json.images.map((b64: string) => ({ b64_json: b64 })),
    } as OpenAI.Images.ImagesResponse
  }
  return json as OpenAI.Images.ImagesResponse
}

export async function requestVeniceImage(options: {
  apiKey: string
  baseUrl: string
  modelId: string
  prompt: string
  quality: GptImageQuality
  n: number
  imagePaths: string[]
  resolution?: GptImageSize
  aspectRatio?: string
}): Promise<OpenAI.Images.ImagesResponse> {
  const {
    apiKey,
    baseUrl,
    modelId,
    prompt,
    quality,
    n,
    imagePaths,
    resolution,
    aspectRatio,
  } = options
  const origin = new URL(baseUrl).origin
  const aspectRatioParam = VENICE_ASPECT_RATIOS.includes(aspectRatio || '')
    ? aspectRatio
    : undefined

  if (imagePaths.length) {
    const images = await Promise.all(
      imagePaths.map(async (file) =>
        (await fs.readFile(file)).toString('base64'),
      ),
    )
    return postVenice(apiKey, `${origin}${MULTI_EDIT_PATH}`, {
      prompt,
      images,
      modelId,
      aspect_ratio: aspectRatioParam ?? 'auto',
      output_format: 'png',
      quality,
      ...(resolution ? { resolution: resolution.toUpperCase() } : {}),
      safe_mode: false,
      enhance_prompt: false,
    })
  }

  return postVenice(apiKey, `${origin}${GENERATE_PATH}`, {
    model: toVeniceGenerateModelId(modelId),
    prompt,
    // Venice 的生成张数参数为 variants（仅支持 1-4）
    variants: Math.min(Math.max(n, 1), 4),
    ...(aspectRatioParam ? { aspect_ratio: aspectRatioParam } : {}),
    ...(resolution ? { resolution: resolution.toUpperCase() } : {}),
    quality,
    format: 'png',
    safe_mode: false,
    enhance_prompt: false,
  })
}
