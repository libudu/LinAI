import { EventEmitter } from 'events'
import fs from 'fs-extra'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import {
  GENERATED_IMAGES_API_PATH,
  GENERATED_IMAGES_DIR,
} from '../../api/common/static'
import { GptImageQuality, GptImageSize } from '../../module/gpt-image/enum'
import { Logger } from '../../module/utils/logger'
import { TaskTemplate } from '../template-manager'

export interface Task {
  id: string
  rawTemplate: TaskTemplate
  source: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  error?: string
  duration?: number
  outputUrl?: string
  createdAt: number
  size?: GptImageSize
  quality?: GptImageQuality
  [key: string]: any
}

export class TaskManager extends EventEmitter {
  private dataDir: string
  private tasksDbPath: string
  private logger: Logger

  constructor() {
    super()
    this.dataDir = path.join(process.cwd(), 'data')
    this.tasksDbPath = path.join(this.dataDir, 'tasks.json')
    this.logger = new Logger('task-manager')
    this.init()
  }

  private init() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true })
    }
    if (!fs.existsSync(this.tasksDbPath)) {
      fs.writeFileSync(this.tasksDbPath, JSON.stringify([]), 'utf-8')
    } else {
      try {
        const data = fs.readFileSync(this.tasksDbPath, 'utf-8')
        const tasks: Task[] = JSON.parse(data)
        let changed = false
        for (const task of tasks) {
          if (task.status === 'pending' || task.status === 'running') {
            task.status = 'failed'
            task.error = '连接已丢失'
            changed = true
          }
        }
        if (changed) {
          fs.writeFileSync(
            this.tasksDbPath,
            JSON.stringify(tasks, null, 2),
            'utf-8',
          )
        }
      } catch (error) {
        this.logger.error('Failed to reset tasks on init:', error)
      }
    }
  }

  private async notifyTasksUpdate() {
    try {
      const tasks = await this.getTasks()
      this.emit('tasks-updated', tasks)
    } catch (error) {
      this.logger.error('Failed to notify tasks update:', error)
    }
  }

  public async getTasks(): Promise<Task[]> {
    try {
      const data = await fs.readFile(this.tasksDbPath, 'utf-8')
      return JSON.parse(data)
    } catch (error) {
      this.logger.error('Failed to read tasks:', error)
      return []
    }
  }

  public async getTasksByUsageType(
    usageType: TaskTemplate['usageType'],
  ): Promise<Task[]> {
    const tasks = await this.getTasks()
    return tasks.filter((t) => t.rawTemplate?.usageType === usageType)
  }

  public async createTaskFromTemplate(options: {
    template: TaskTemplate
    source: string
    size?: GptImageSize
    quality?: GptImageQuality
  }): Promise<Task> {
    const tasks = await this.getTasks()
    const newTask: Task = {
      id: uuidv4(),
      rawTemplate: options.template,
      source: options.source,
      size: options.size,
      quality: options.quality,
      status: 'pending',
      createdAt: Date.now(),
    }
    tasks.push(newTask)
    await fs.writeFile(
      this.tasksDbPath,
      JSON.stringify(tasks, null, 2),
      'utf-8',
    )
    this.notifyTasksUpdate()
    return newTask
  }

  public async deleteTask(
    id: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const tasks = await this.getTasks()
      const target = tasks.find((t) => t.id === id)
      if (!target) {
        return { success: false, error: 'Task not found' }
      }

      const filtered = tasks.filter((t) => t.id !== id)
      await fs.writeFile(
        this.tasksDbPath,
        JSON.stringify(filtered, null, 2),
        'utf-8',
      )
      this.notifyTasksUpdate()

      if (target.outputUrl && target.outputUrl.startsWith('/api/static/')) {
        try {
          const filepath = path.join(
            GENERATED_IMAGES_DIR,
            target.outputUrl.replace(GENERATED_IMAGES_API_PATH + '/', ''),
          )

          if (filepath && fs.existsSync(filepath)) {
            await fs.unlink(filepath)
          }
        } catch (error: any) {
          this.logger.error('Failed to delete task file:', error)
          return {
            success: false,
            error: `Failed to delete task file: ${error.message}`,
          }
        }
      }
      return { success: true }
    } catch (error: any) {
      this.logger.error('Failed to delete task:', error)
      return {
        success: false,
        error: `Failed to delete task: ${error.message}`,
      }
    }
  }

  public async updateTask(
    id: string,
    updates: Partial<Task>,
  ): Promise<boolean> {
    const tasks = await this.getTasks()
    const index = tasks.findIndex((t) => t.id === id)
    if (index === -1) {
      return false
    }

    tasks[index] = { ...tasks[index], ...updates }
    await fs.writeFile(
      this.tasksDbPath,
      JSON.stringify(tasks, null, 2),
      'utf-8',
    )
    this.notifyTasksUpdate()
    return true
  }

  public async updateTaskStatus(
    id: string,
    status: Task['status'],
    error?: string,
  ): Promise<boolean> {
    const tasks = await this.getTasks()
    const index = tasks.findIndex((t) => t.id === id)
    if (index === -1) {
      return false
    }

    tasks[index].status = status
    if (error) {
      tasks[index].error = error
    }
    await fs.writeFile(
      this.tasksDbPath,
      JSON.stringify(tasks, null, 2),
      'utf-8',
    )
    this.notifyTasksUpdate()
    return true
  }
}
