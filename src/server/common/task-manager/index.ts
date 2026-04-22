import fs from 'fs-extra'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { TaskTemplate, TemplateManager } from '../template-manager'

export interface Task extends Omit<TaskTemplate, 'id'> {
  id: string
  templateId: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  error?: string
}

export class TaskManager {
  private dataDir: string
  private tasksDbPath: string
  private templateManager: TemplateManager

  constructor() {
    this.dataDir = path.join(process.cwd(), 'data')
    this.tasksDbPath = path.join(this.dataDir, 'tasks.json')
    this.templateManager = new TemplateManager()
    this.init()
  }

  private init() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true })
    }
    if (!fs.existsSync(this.tasksDbPath)) {
      fs.writeFileSync(this.tasksDbPath, JSON.stringify([]), 'utf-8')
    }
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
    const templates = await this.templateManager.getTemplates()
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
