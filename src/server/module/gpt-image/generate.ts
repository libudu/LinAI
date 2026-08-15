import crypto from 'crypto'
import fs from 'fs-extra'
import { writeFile } from 'fs/promises'
import OpenAI, { toFile } from 'openai'
import path from 'path'
import { GENERATED_IMAGES_DIR } from '../../common/static'
import {
  GptImageQuality,
  GptImageSize,
  isDragonEndpoint,
  isVeniceEndpoint,
} from './enum'
import { writePngGenerationInfo } from './png-meta'
import { requestVeniceImage } from './venice'

export interface GptImageUsage {
  total_tokens: number
  input_tokens: number
  output_tokens: number
  input_tokens_details?: {
    text_tokens: number
    image_tokens: number
  }
}

export interface GenerateGPTImageOptions {
  apiKey: string
  baseUrl: string
  modelId: string
  prompt: string
  size: string
  quality: GptImageQuality
  imagePaths: string[]
  n?: number
  /** 分辨率档位（1k/2k/4k），Venice 接入点原样传给网关 */
  resolution?: GptImageSize
  /** 模板宽高比（如 16:9），Venice 接入点作为 aspect_ratio 传给网关 */
  aspectRatio?: string
}

// 规范化接入点 baseUrl：去尾部斜杠，剥掉误粘贴的 /images/generations、/images/edits 后缀
function normalizeGptImageBaseUrl(baseUrl: string): string {
  return baseUrl
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/images\/(generations|edits)$/i, '')
}

// DragonAPI 特殊处理：不同分辨率档位使用不同模型 id
// 1k → gpt-image-2，2k → gpt-image-2-2k，4k → gpt-image-2-4k
function resolveDragonModelId(
  baseUrl: string,
  modelId: string,
  resolution?: GptImageSize,
): string {
  if (!isDragonEndpoint(baseUrl)) return modelId
  if (resolution === '2k') return `${modelId}-2k`
  if (resolution === '4k') return `${modelId}-4k`
  return modelId
}

export function calculateSize(
  aspectRatio: string,
  baseSize: GptImageSize,
): string {
  const [wStr, hStr] = aspectRatio.split(':')
  const wRatio = parseInt(wStr, 10)
  const hRatio = parseInt(hStr, 10)

  let targetSize: number
  if (baseSize === '1k') targetSize = 1024
  else if (baseSize === '2k') targetSize = 2048
  else if (baseSize === '4k') targetSize = 3840
  else targetSize = 1024

  let width: number
  let height: number

  if (isNaN(wRatio) || isNaN(hRatio) || hRatio === 0) {
    width = targetSize
    height = targetSize
  } else {
    const ratio = wRatio / hRatio
    if (baseSize === '1k') {
      // 1k: 保留短边 1024
      if (ratio >= 1) {
        height = targetSize
        width = Math.round((targetSize * ratio) / 16) * 16
      } else {
        width = targetSize
        height = Math.round(targetSize / ratio / 16) * 16
      }
    } else {
      // 2k 和 4k: 保留长边 2048 / 3840
      if (ratio >= 1) {
        width = targetSize
        height = Math.round(targetSize / ratio / 16) * 16
      } else {
        height = targetSize
        width = Math.round((targetSize * ratio) / 16) * 16
      }
    }
  }

  const MAX_PIXELS = 8294400
  if (width * height > MAX_PIXELS) {
    const scale = Math.sqrt(MAX_PIXELS / (width * height))
    width = Math.floor((width * scale) / 16) * 16
    height = Math.floor((height * scale) / 16) * 16

    if (width === 0) width = 16
    if (height === 0) height = 16
  }

  return `${width}x${height}`
}

// 标准 OpenAI 契约：SDK 自动拼接 /images/generations 与 /images/edits
async function requestOpenAIImage(options: {
  apiKey: string
  baseUrl: string
  modelId: string
  prompt: string
  size: string
  quality: GptImageQuality
  n: number
  imagePaths: string[]
}): Promise<OpenAI.Images.ImagesResponse> {
  const { apiKey, baseUrl, modelId, prompt, size, quality, n, imagePaths } =
    options
  const client = new OpenAI({
    apiKey,
    baseURL: baseUrl,
    // 关闭 SDK 默认的自动重试（默认 maxRetries: 2），失败直接抛错
    maxRetries: 0,
  })
  if (imagePaths.length) {
    const imagesToUpload = await Promise.all(
      imagePaths.map(
        async (file) =>
          await toFile(fs.createReadStream(file), null, {
            type: 'image/png',
          }),
      ),
    )
    return await client.images.edit({
      model: modelId,
      image: imagesToUpload,
      prompt: prompt,
      n,
      size: size as any,
      quality,
    })
  }
  return await client.images.generate({
    model: modelId,
    prompt,
    n,
    size: size as any,
    quality,
    moderation: 'low',
  })
}

export async function generateGPTImage(options: GenerateGPTImageOptions) {
  const {
    apiKey,
    baseUrl,
    modelId,
    prompt,
    size,
    quality,
    imagePaths: images,
    n = 1,
    resolution,
    aspectRatio,
  } = options
  const normalizedBaseUrl = normalizeGptImageBaseUrl(baseUrl)
  // DragonAPI 接入点按分辨率档位切换模型 id
  const finalModelId = resolveDragonModelId(
    normalizedBaseUrl,
    modelId,
    resolution,
  )

  // Venice 接入点走原生接口（见 venice.ts），其余走标准 OpenAI 契约
  const res: OpenAI.Images.ImagesResponse = isVeniceEndpoint(normalizedBaseUrl)
    ? await requestVeniceImage({
        apiKey,
        baseUrl: normalizedBaseUrl,
        modelId,
        prompt,
        quality,
        n,
        imagePaths: images,
        resolution,
        aspectRatio,
      })
    : await requestOpenAIImage({
        apiKey,
        baseUrl: normalizedBaseUrl,
        modelId: finalModelId,
        prompt,
        size,
        quality,
        n,
        imagePaths: images,
      })

  const filenames: string[] = []

  // 写入 PNG 元数据的生成参数（写入失败不影响图片保存）
  const generationInfo = {
    baseUrl: normalizedBaseUrl,
    model: finalModelId,
    prompt,
    size,
    quality,
    generatedAt: new Date().toISOString(),
  }

  if (res.data && res.data.length > 0) {
    for (const item of res.data) {
      let imageBuffer: Buffer | undefined

      if (item.b64_json) {
        imageBuffer = Buffer.from(item.b64_json, 'base64')
      } else if (item.url) {
        const imageResponse = await fetch(item.url)
        if (!imageResponse.ok) {
          throw new Error(
            `Failed to download generated image: ${imageResponse.status} ${imageResponse.statusText}`,
          )
        }
        imageBuffer = Buffer.from(await imageResponse.arrayBuffer())
      }

      if (!imageBuffer) continue

      imageBuffer = writePngGenerationInfo(imageBuffer, generationInfo)

      const hash = crypto.createHash('md5').update(imageBuffer).digest('hex')
      const filename = `${hash}.png`
      const filepath = path.join(GENERATED_IMAGES_DIR, filename)
      await writeFile(filepath, imageBuffer)
      filenames.push(filename)
    }
  }

  return {
    filenames,
    usage: res.usage as GptImageUsage | undefined,
  }
}
