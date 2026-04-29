import fs from 'fs-extra'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

export interface TaskTemplate {
  id: string
  title?: string
  images: string[]
  prompt: string
  createdAt: number
  usageType: 'image' | 'video'
  aspectRatio?: string
  folder?: string
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
      this.addTemplate({
        title: '模板示例1',
        images: [],
        prompt: '生成一张2030年福瑞（furry）科目的中考试卷',
        usageType: 'image',
        aspectRatio: '16:9',
      })
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
    template: Omit<TaskTemplate, 'id' | 'createdAt'>,
  ): Promise<TaskTemplate> {
    const templates = await this.getTemplates()
    const id = uuidv4()

    const newTemplate: TaskTemplate = {
      ...template,
      images: template.images || [],
      id,
      createdAt: Date.now(),
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

  public async updateTemplate(
    id: string,
    updates: Partial<
      Pick<
        TaskTemplate,
        'title' | 'prompt' | 'aspectRatio' | 'folder' | 'images'
      >
    >,
  ): Promise<TaskTemplate | null> {
    const templates = await this.getTemplates()
    const index = templates.findIndex((t) => t.id === id)
    if (index === -1) {
      return null
    }

    templates[index] = {
      ...templates[index],
      ...updates,
    }
    await fs.writeFile(this.dbPath, JSON.stringify(templates, null, 2), 'utf-8')
    return templates[index]
  }

  public async renameFolder(
    oldFolder: string,
    newFolder: string,
  ): Promise<number> {
    const templates = await this.getTemplates()
    let updatedCount = 0

    for (const t of templates) {
      if (t.folder === oldFolder) {
        t.folder = newFolder
        updatedCount++
      }
    }

    if (updatedCount > 0) {
      await fs.writeFile(
        this.dbPath,
        JSON.stringify(templates, null, 2),
        'utf-8',
      )
    }
    return updatedCount
  }
}

export const templateManager = new TemplateManager()
