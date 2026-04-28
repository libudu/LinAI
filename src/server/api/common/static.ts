import { zValidator } from '@hono/zod-validator'
import crypto from 'crypto'
import fs from 'fs-extra'
import { Hono } from 'hono'
import { Image } from 'imagescript'
import path from 'path'
import { z } from 'zod'

// 图片处理配置
export const IMAGE_MAX_DIMENSION = 1600
// webp 默认就有 80 的压缩
export const IMAGE_COMPRESS_QUALITY = 60

// 目录配置
export const GENERATED_IMAGES_DIR = path.join(
  process.cwd(),
  'data',
  'images',
  'generated'
)
export const INPUT_IMAGES_DIR = path.join(
  process.cwd(),
  'data',
  'images',
  'input'
)

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

        let imageInstance = await Image.decode(buffer)

        // 缩放到长宽最多1920px (配置为 IMAGE_MAX_DIMENSION)
        if (
          imageInstance.width &&
          imageInstance.height &&
          (imageInstance.width > IMAGE_MAX_DIMENSION ||
            imageInstance.height > IMAGE_MAX_DIMENSION)
        ) {
          if (imageInstance.width > imageInstance.height) {
            imageInstance.resize(IMAGE_MAX_DIMENSION, Image.RESIZE_AUTO)
          } else {
            imageInstance.resize(Image.RESIZE_AUTO, IMAGE_MAX_DIMENSION)
          }
        }

        const webpBufferUint8 = await imageInstance.encodeWEBP(
          IMAGE_COMPRESS_QUALITY as any
        )
        const webpBuffer = Buffer.from(webpBufferUint8)

        const hash = crypto.createHash('md5').update(webpBuffer).digest('hex')
        const filename = `${hash}.webp`
        const filepath = path.join(INPUT_IMAGES_DIR, filename)

        if (!fs.existsSync(filepath)) {
          await fs.writeFile(filepath, webpBuffer)
        }

        return c.json({
          success: true,
          url: `${INPUT_IMAGES_API_PATH}/${filename}`
        })
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
