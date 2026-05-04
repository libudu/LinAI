import { zValidator } from '@hono/zod-validator'
import crypto from 'crypto'
import fs from 'fs-extra'
import { Hono } from 'hono'
import path from 'path'
import sharp from 'sharp'
import { z } from 'zod'
import { templateManager } from '../../common/template-manager'

/** 图片最大尺寸（像素） */
export const IMAGE_MAX_DIMENSION = 1600
/** WebP 压缩质量 */
export const IMAGE_COMPRESS_QUALITY = 60

/** 生成的图片存储目录 */
export const GENERATED_IMAGES_DIR = path.join(
  process.cwd(),
  'data',
  'images',
  'generated',
)
/** 上传的图片存储目录 */
export const INPUT_IMAGES_DIR = path.join(
  process.cwd(),
  'data',
  'images',
  'input',
)

/** 确保图片目录存在 */
if (!fs.existsSync(GENERATED_IMAGES_DIR)) {
  fs.mkdirSync(GENERATED_IMAGES_DIR, { recursive: true })
}
if (!fs.existsSync(INPUT_IMAGES_DIR)) {
  fs.mkdirSync(INPUT_IMAGES_DIR, { recursive: true })
}

/** 生成图片 API 访问路径 */
export const GENERATED_IMAGES_API_PATH = '/api/static/images/generated'
/** 输入图片 API 访问路径 */
export const INPUT_IMAGES_API_PATH = '/api/static/images/input'

/**
 * 静态资源 API 路由
 * 包含图片上传、下载、格式转换等功能
 */
const staticApi = new Hono()
  /**
   * 上传图片：将 base64 图片转换为 WebP 格式并存储
   * 使用 MD5 哈希去重，相同图片不会重复存储
   */
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

        const webpBuffer = await sharp(buffer)
          .resize(IMAGE_MAX_DIMENSION, IMAGE_MAX_DIMENSION, {
            fit: 'inside',
            withoutEnlargement: true
          })
          .webp({ quality: IMAGE_COMPRESS_QUALITY })
          .toBuffer()

        const hash = crypto.createHash('md5').update(webpBuffer).digest('hex')
        const filename = `${hash}.webp`
        const filepath = path.join(INPUT_IMAGES_DIR, filename)

        if (!fs.existsSync(filepath)) {
          await fs.writeFile(filepath, webpBuffer)
        }

        return c.json({
          success: true,
          url: `${INPUT_IMAGES_API_PATH}/${filename}`,
        })
      } catch (error) {
        console.error('Image upload failed:', error)
        return c.json({ success: false, error: 'Image processing failed' })
      }
    },
  )
  /**
   * 获取生成的图片文件
   */
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
    },
  )
  /**
   * 获取上传的图片文件
   */
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
    },
  )
  /**
   * 打开上传图片存储目录（系统文件管理器）
   */
  .post('/images/input/open-dir', async (c) => {
    try {
      const { exec } = require('child_process')
      const command =
        process.platform === 'win32'
          ? `start "" "${INPUT_IMAGES_DIR}"`
          : process.platform === 'darwin'
            ? `open "${INPUT_IMAGES_DIR}"`
            : `xdg-open "${INPUT_IMAGES_DIR}"`
      exec(command)
      return c.json({ success: true })
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500)
    }
  })
  /**
   * 清理未被任何模板引用的上传图片
   */
  .post('/images/input/clear-unreferenced', async (c) => {
    try {
      const templates = await templateManager.getTemplates()
      const referencedImages = new Set<string>()

      for (const t of templates) {
        if (t.images && Array.isArray(t.images)) {
          for (const imgUrl of t.images) {
            if (imgUrl.startsWith(INPUT_IMAGES_API_PATH)) {
              const filename = imgUrl.split('/').pop()
              if (filename) referencedImages.add(filename)
            }
          }
        }
      }

      const files = await fs.readdir(INPUT_IMAGES_DIR)
      let deletedCount = 0
      for (const file of files) {
        if (!referencedImages.has(file)) {
          await fs.remove(path.join(INPUT_IMAGES_DIR, file))
          deletedCount++
        }
      }

      return c.json({ success: true, deletedCount })
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500)
    }
  })
  /**
   * 将本地图片转换为 base64 编码
   * 用于预设导出功能，使导出文件自包含图片数据
   */
  .post(
    '/images/to-base64',
    zValidator('json', z.object({ url: z.string() })),
    async (c) => {
      const { url } = c.req.valid('json')

      try {
        let filepath: string | null = null

        /** 根据 URL 前缀确定图片存储目录 */
        if (url.startsWith(GENERATED_IMAGES_API_PATH)) {
          const filename = url.split('/').pop()
          if (filename) {
            filepath = path.join(GENERATED_IMAGES_DIR, filename)
          }
        } else if (url.startsWith(INPUT_IMAGES_API_PATH)) {
          const filename = url.split('/').pop()
          if (filename) {
            filepath = path.join(INPUT_IMAGES_DIR, filename)
          }
        }

        if (!filepath || !fs.existsSync(filepath)) {
          return c.json({ success: false, error: 'Image file not found' }, 404)
        }

        const fileBuffer = await fs.readFile(filepath)
        const base64 = fileBuffer.toString('base64')

        /** 根据文件扩展名确定 MIME 类型 */
        const ext = path.extname(filepath).slice(1)
        const mimeType = ext === 'jpg' ? 'jpeg' : ext === 'webp' ? 'webp' : ext

        return c.json({
          success: true,
          data: {
            base64: `data:image/${mimeType};base64,${base64}`,
            filename: path.basename(filepath),
          },
        })
      } catch (error: any) {
        return c.json({ success: false, error: error.message }, 500)
      }
    },
  )

export default staticApi
