import fs from 'fs-extra'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

export interface TaskTemplate {
  id: string
  image: string
  prompt: string
  quality: string
  aspectRatio: string
  createdAt: number
  source: 'wan-video' | 'gemini-image'
}

export interface GeminiTaskTemplate extends TaskTemplate {
  // Add any gemini specific fields here if needed
}

export class TaskManager {
  private dataDir: string
  private imagesDir: string
  private dbPath: string

  constructor() {
    this.dataDir = path.join(process.cwd(), 'data')
    this.imagesDir = path.join(this.dataDir, 'images')
    this.dbPath = path.join(this.dataDir, 'templates.json')
    this.init()
  }

  private init() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true })
    }
    if (!fs.existsSync(this.imagesDir)) {
      fs.mkdirSync(this.imagesDir, { recursive: true })
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

  public async addTemplate(template: Omit<TaskTemplate, 'id' | 'createdAt'>): Promise<TaskTemplate> {
    const templates = await this.getTemplates()
    const id = uuidv4()
    
    let imageUrl = template.image
    // If it's a base64 string, save it as a file
    if (imageUrl.startsWith('data:image')) {
      const matches = imageUrl.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/)
      if (matches) {
        const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1]
        const buffer = Buffer.from(matches[2], 'base64')
        const filename = `${id}.${ext}`
        const filepath = path.join(this.imagesDir, filename)
        await fs.writeFile(filepath, buffer)
        imageUrl = `/api/task/images/${filename}`
      }
    }

    const newTemplate: TaskTemplate = {
      ...template,
      image: imageUrl,
      id,
      createdAt: Date.now()
    }
    templates.push(newTemplate)
    await fs.writeFile(this.dbPath, JSON.stringify(templates, null, 2), 'utf-8')
    return newTemplate
  }

  public async deleteTemplate(id: string): Promise<boolean> {
    const templates = await this.getTemplates()
    const target = templates.find(t => t.id === id)
    if (!target) {
      return false
    }

    // Attempt to delete associated image file
    if (target.image.startsWith('/api/task/images/')) {
      const filename = target.image.split('/').pop()
      if (filename) {
        const filepath = path.join(this.imagesDir, filename)
        if (fs.existsSync(filepath)) {
          await fs.unlink(filepath)
        }
      }
    }

    const filtered = templates.filter(t => t.id !== id)
    await fs.writeFile(this.dbPath, JSON.stringify(filtered, null, 2), 'utf-8')
    return true
  }
}
