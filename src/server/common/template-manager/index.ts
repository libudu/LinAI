import fs from 'fs-extra'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import crypto from 'crypto'
import sharp from 'sharp'
import {
  IMAGE_MAX_DIMENSION,
  IMAGE_COMPRESS_THRESHOLD,
  IMAGE_COMPRESS_QUALITY,
  INPUT_IMAGES_DIR,
  INPUT_IMAGES_API_PATH
} from '../../api/common/static'

export interface TaskTemplate {
  id: string
  title?: string
  images: string[]
  prompt: string
  createdAt: number
  usageType: 'image' | 'video'
  aspectRatio?: string
}

export interface GeminiTaskTemplate extends TaskTemplate {
  // Add any gemini specific fields here if needed
}

class TemplateManager {
  private dataDir: string
  private dbPath: string

  constructor() {
    this.dataDir = path.join(process.cwd(), 'data')
    this.dbPath = path.join(this.dataDir, 'templates.json')
    this.init()
  }

  private init() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true })
    }
    if (!fs.existsSync(this.dbPath)) {
      fs.writeFileSync(this.dbPath, JSON.stringify([]), 'utf-8')
    }
  }

  public async getTemplates(): Promise<TaskTemplate[]> {
    try {
      const data = await fs.readFile(this.dbPath, 'utf-8')
      return JSON.parse(data)
    } catch (error) {
      console.error('Failed to read templates:', error)
      return []
    }
  }

  public async addTemplate(
    template: Omit<TaskTemplate, 'id' | 'createdAt'>
  ): Promise<TaskTemplate> {
    const templates = await this.getTemplates()
    const id = uuidv4()

    let imageUrls: string[] = []

    if (template.images && Array.isArray(template.images)) {
      for (const imgUrl of template.images) {
        if (imgUrl.startsWith('data:image')) {
          const matches = imgUrl.match(
            /^data:image\/([a-zA-Z0-9]+);base64,(.+)$/
          )
          if (matches) {
            const buffer = Buffer.from(matches[2], 'base64')

            let sharpInstance = sharp(buffer)
            const metadata = await sharpInstance.metadata()

            // 缩放到长宽最多1920px
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

            // 如果超过200kb进行75quality的压缩
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
            imageUrls.push(`${INPUT_IMAGES_API_PATH}/${filename}`)
          }
        } else {
          imageUrls.push(imgUrl)
        }
      }
    }

    const newTemplate: TaskTemplate = {
      ...template,
      images: imageUrls,
      id,
      createdAt: Date.now()
    }
    templates.push(newTemplate)
    await fs.writeFile(this.dbPath, JSON.stringify(templates, null, 2), 'utf-8')
    return newTemplate
  }

  public async deleteTemplate(id: string): Promise<boolean> {
    const templates = await this.getTemplates()
    const target = templates.find((t) => t.id === id)
    if (!target) {
      return false
    }

    const filtered = templates.filter((t) => t.id !== id)
    await fs.writeFile(this.dbPath, JSON.stringify(filtered, null, 2), 'utf-8')
    return true
  }
}

export const templateManager = new TemplateManager()

