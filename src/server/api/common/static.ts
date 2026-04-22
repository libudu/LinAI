import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import fs from 'fs-extra'
import path from 'path'

const tempImagesDir = path.join(process.cwd(), 'data', 'temp_images')
if (!fs.existsSync(tempImagesDir)) {
  fs.mkdirSync(tempImagesDir, { recursive: true })
}

const staticApi = new Hono()
  .get(
    '/temp/:filename',
    zValidator('param', z.object({ filename: z.string() })),
    async (c) => {
      const { filename } = c.req.valid('param')
      const filepath = path.join(tempImagesDir, filename)
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
    '/images/:filename',
    zValidator('param', z.object({ filename: z.string() })),
    async (c) => {
      const { filename } = c.req.valid('param')
      const filepath = path.join(process.cwd(), 'data', 'images', filename)
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
