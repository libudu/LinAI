import fs from 'fs-extra'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

import crypto from 'crypto'

export interface TaskTemplate {
  id: string
  images: string[]
  prompt: string
  createdAt: number
  source: 'wan-video' | 'gemini-image'
}

export interface Task extends Omit<TaskTemplate, 'id'> {
  id: string
  templateId: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  error?: string
}

export interface GeminiTaskTemplate extends TaskTemplate {
  // Add any gemini specific fields here if needed
}

export class TaskManager {
  private dataDir: string
  private imagesDir: string
  private dbPath: string
  private tasksDbPath: string

  constructor() {
    this.dataDir = path.join(process.cwd(), 'data')
    this.imagesDir = path.join(this.dataDir, 'images')
    this.dbPath = path.join(this.dataDir, 'templates.json')
    this.tasksDbPath = path.join(this.dataDir, 'tasks.json')
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
    if (!fs.existsSync(this.tasksDbPath)) {
      fs.writeFileSync(this.tasksDbPath, JSON.stringify([]), 'utf-8')
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
    
    let imageUrls: string[] = []
    
    if (template.images && Array.isArray(template.images)) {
      for (const imgUrl of template.images) {
        if (imgUrl.startsWith('data:image')) {
          const matches = imgUrl.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/)
          if (matches) {
            const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1]
            const buffer = Buffer.from(matches[2], 'base64')
            const hash = crypto.createHash('md5').update(buffer).digest('hex')
            const filename = `${hash}.${ext}`
            const filepath = path.join(this.imagesDir, filename)
            
            if (!fs.existsSync(filepath)) {
              await fs.writeFile(filepath, buffer)
            }
            imageUrls.push(`/api/task/images/${filename}`)
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
    const target = templates.find(t => t.id === id)
    if (!target) {
      return false
    }

    // Attempt to delete associated image files (Note: MD5 hashing means images could be shared among multiple templates. It's safer not to delete them, but we'll leave it simple for now or check usage).
    // Given the task, let's not delete the physical file since other templates might be using the same md5 image.
    // So we just remove from DB.

    const filtered = templates.filter(t => t.id !== id)
    await fs.writeFile(this.dbPath, JSON.stringify(filtered, null, 2), 'utf-8')
    return true
  }

  public async getTasks(): Promise<Task[]> {
    try {
      const data = await fs.readFile(this.tasksDbPath, 'utf-8')
      return JSON.parse(data)
    } catch (error) {
      console.error('Failed to read tasks:', error)
      return []
    }
  }

  public async getTasksBySource(source: string): Promise<Task[]> {
    const tasks = await this.getTasks()
    return tasks.filter(t => t.source === source)
  }

  public async createTaskFromTemplate(templateId: string): Promise<Task | null> {
    const templates = await this.getTemplates()
    const template = templates.find(t => t.id === templateId)
    if (!template) {
      return null
    }

    const tasks = await this.getTasks()
    const newTask: Task = {
      ...template,
      id: uuidv4(),
      templateId: template.id,
      status: 'pending',
      createdAt: Date.now()
    }
    tasks.push(newTask)
    await fs.writeFile(this.tasksDbPath, JSON.stringify(tasks, null, 2), 'utf-8')
    return newTask
  }

  public async deleteTask(id: string): Promise<boolean> {
    const tasks = await this.getTasks()
    const target = tasks.find(t => t.id === id)
    if (!target) {
      return false
    }

    const filtered = tasks.filter(t => t.id !== id)
    await fs.writeFile(this.tasksDbPath, JSON.stringify(filtered, null, 2), 'utf-8')
    return true
  }

  public async updateTaskStatus(id: string, status: Task['status'], error?: string): Promise<boolean> {
    const tasks = await this.getTasks()
    const index = tasks.findIndex(t => t.id === id)
    if (index === -1) {
      return false
    }

    tasks[index].status = status
    if (error) {
      tasks[index].error = error
    }
    await fs.writeFile(this.tasksDbPath, JSON.stringify(tasks, null, 2), 'utf-8')
    return true
  }
}
