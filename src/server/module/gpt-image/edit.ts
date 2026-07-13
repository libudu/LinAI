import crypto from 'crypto'
import { writeFile } from 'fs/promises'
import OpenAI, { toFile } from 'openai'
import type { ImagesResponse } from 'openai/resources/images'
import path from 'path'
import { GENERATED_IMAGES_DIR } from '../../common/static'
import { Logger } from '../utils/logger'

const logger = new Logger('gpt-image-edit')

export interface EditImageOptions {
  apiKey: string
  baseURL: string
  imageBase64: string
  maskBase64?: string
  prompt: string
  model?: string
  n?: number
  quality?: 'standard' | 'low' | 'medium' | 'high' | 'auto'
}

export async function handleImageEdit(options: EditImageOptions) {
  const {
    apiKey,
    baseURL,
    imageBase64,
    maskBase64,
    prompt,
    model = 'gpt-image-2',
    n = 1,
    quality = 'auto',
  } = options

  logger.info(`Step 1/5 — Creating OpenAI client — baseURL=${baseURL} model=${model}`)
  const client = new OpenAI({ apiKey, baseURL })

  logger.info(`Step 2/5 — Decoding image (${imageBase64.length} chars)`)
  const imageBuffer = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64')
  logger.info(`  → image buffer: ${imageBuffer.length} bytes`)
  const imageFile = await toFile(imageBuffer, 'image.png', { type: 'image/png' })

  let maskFile: File | undefined
  if (maskBase64) {
    logger.info(`Step 2b/5 — Decoding mask (${maskBase64.length} chars)`)
    const maskBuffer = Buffer.from(maskBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64')
    logger.info(`  → mask buffer: ${maskBuffer.length} bytes`)
    maskFile = await toFile(maskBuffer, 'mask.png', { type: 'image/png' })
  } else {
    logger.info(`Step 2b/5 — No mask provided`)
  }

  logger.info(`Step 3/5 — Calling client.images.edit() — n=${n}`)
  let res: ImagesResponse
  try {
    res = await client.images.edit({
      model,
      image: imageFile,
      mask: maskFile,
      prompt,
      n,
      quality,
      output_format: 'webp',
      size: 'auto',
      response_format: 'b64_json',
    })
  } catch (apiError: unknown) {
    const message = apiError instanceof Error ? apiError.message : String(apiError)
    const status = apiError && typeof apiError === 'object' && 'status' in apiError
      ? (apiError as { status: number }).status : undefined
    logger.error(`Step 3/5 FAILED — error=${message} status=${status}`)
    if (apiError instanceof Error && apiError.stack) {
      logger.error(`  stack: ${apiError.stack.split('\n').slice(0, 4).join(' | ')}`)
    }
    throw apiError
  }

  logger.info(`Step 4/5 — API returned`)

  // Standard SDK returns data as Image[], but yunwu.ai returns data as { b64_json }
  const items = Array.isArray(res.data)
    ? res.data
    : res.data
      ? [res.data as unknown as { b64_json?: string; url?: string }]
      : []

  logger.info(`  → items=${items.length}`)

  const filenames: string[] = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.b64_json) {
      const imgBuffer = Buffer.from(item.b64_json, 'base64')
      const hash = crypto.createHash('md5').update(imgBuffer).digest('hex')
      const filename = `${hash}.webp`
      await writeFile(path.join(GENERATED_IMAGES_DIR, filename), imgBuffer)
      filenames.push(filename)
      logger.info(`  → saved image[${i}]: ${filename} (${imgBuffer.length} bytes)`)
    } else if (item.url) {
      logger.info(`  → image[${i}] has url=${item.url} — fetching...`)
      const imgResp = await fetch(item.url)
      const imgBuffer = Buffer.from(await imgResp.arrayBuffer())
      const urlHash = crypto.createHash('md5').update(imgBuffer).digest('hex')
      const filename = `${urlHash}.webp`
      await writeFile(path.join(GENERATED_IMAGES_DIR, filename), imgBuffer)
      filenames.push(filename)
      logger.info(`  → saved image[${i}] from url: ${filename} (${imgBuffer.length} bytes)`)
    } else {
      logger.warn(`  → image[${i}] has neither b64_json nor url`)
    }
  }

  logger.info(`Step 5/5 — Done — ${filenames.length} files saved`)
  return { filenames }
}
