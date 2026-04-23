import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import fs from 'fs-extra'
import path from 'path'
import crypto from 'crypto'
import sharp from 'sharp'

// 图片处理配置
export const IMAGE_MAX_DIMENSION = 1600
export const IMAGE_COMPRESS_THRESHOLD = 150 * 1024 // 150kb
export const IMAGE_COMPRESS_QUALITY = 75

// 目录配置
export const GENERATED_IMAGES_DIR = path.join(process.cwd(), 'data', 'images', 'generated')
export const INPUT_IMAGES_DIR = path.join(process.cwd(), 'data', 'images', 'input')

if (!fs.existsSync(GENERATED_IMAGES_DIR)) {
  fs.mkdirSync(GENERATED_IMAGES_DIR, { recursive: true })
}
if (!fs.existsSync(INPUT_IMAGES_DIR)) {
  fs.mkdirSync(INPUT_IMAGES_DIR, { recursive: true })
}

// 生成图片API路径
export const GENERATED_IMAGES_API_PATH = '/api/static/images/generated'

// 输入图片API路径
export const INPUT_IMAGES_API_PATH = '/api/static/images/input'

const staticApi = new Hono()
  .post(
    '/images/upload',
    zValidator('json', z.object({ image: z.string() })),
    async (c) => {
      const { image } = c.req.valid('json')

      if (!image.startsWith('data:image')) {
        return c.json({ success: false, error: 'Invalid image format' })
      }

      const matches = image.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/)
      if (!matches) {
        return c.json({ success: false, error: 'Invalid base64 image data' })
      }

      try {
        const buffer = Buffer.from(matches[2], 'base64')

        let sharpInstance = sharp(buffer)
        const metadata = await sharpInstance.metadata()

        // 缩放到长宽最多1920px (配置为 IMAGE_MAX_DIMENSION)
        if (
          metadata.width &&
          metadata.height &&
          (metadata.width > IMAGE_MAX_DIMENSION || metadata.height > IMAGE_MAX_DIMENSION)
        ) {
          sharpInstance = sharpInstance.resize({
            width: IMAGE_MAX_DIMENSION,
            height: IMAGE_MAX_DIMENSION,
            fit: 'inside',
            withoutEnlargement: true
          })
        }

        let webpBuffer = await sharpInstance.webp().toBuffer()

        // 如果超过指定大小进行指定quality的压缩
        if (webpBuffer.length > IMAGE_COMPRESS_THRESHOLD) {
          webpBuffer = await sharpInstance.webp({ quality: IMAGE_COMPRESS_QUALITY }).toBuffer()
        }

        const hash = crypto
          .createHash('md5')
          .update(webpBuffer)
          .digest('hex')
        const filename = `${hash}.webp`
        const filepath = path.join(INPUT_IMAGES_DIR, filename)

        if (!fs.existsSync(filepath)) {
          await fs.writeFile(filepath, webpBuffer)
        }

        return c.json({ success: true, url: `${INPUT_IMAGES_API_PATH}/${filename}` })
      } catch (error) {
        console.error('Image upload failed:', error)
        return c.json({ success: false, error: 'Image processing failed' })
      }
    }
  )
  .get(
    '/images/generated/:filename',
    zValidator('param', z.object({ filename: z.string() })),
    async (c) => {
      const { filename } = c.req.valid('param')
      const filepath = path.join(GENERATED_IMAGES_DIR, filename)
      if (fs.existsSync(filepath)) {
        const file = await fs.readFile(filepath)
        const ext = path.extname(filename).slice(1)
        let mimeType = ext === 'jpg' ? 'jpeg' : ext
        if (ext === 'webp') mimeType = 'webp'
        c.header('Content-Type', `image/${mimeType}`)
        return c.body(file)
      }
      return c.notFound()
    }
  )
  .get(
    '/images/input/:filename',
    zValidator('param', z.object({ filename: z.string() })),
    async (c) => {
      const { filename } = c.req.valid('param')
      const filepath = path.join(INPUT_IMAGES_DIR, filename)
      if (fs.existsSync(filepath)) {
        const file = await fs.readFile(filepath)
        const ext = path.extname(filename).slice(1)
        let mimeType = ext === 'jpg' ? 'jpeg' : ext
        if (ext === 'webp') {
          mimeType = 'webp'
        }
        c.header('Content-Type', `image/${mimeType}`)
        return c.body(file)
      }
      return c.notFound()
    }
  )

export default staticApi
