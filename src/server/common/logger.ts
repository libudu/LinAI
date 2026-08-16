import { EventEmitter } from 'events'
import fs from 'fs-extra'
import path from 'path'
import { dataPath } from './storage/data-path'

const LOG_DIR = dataPath('logs')

export class Logger extends EventEmitter {
  private id: string
  private logFile: string

  constructor(id: string) {
    super()
    this.id = id
    fs.ensureDirSync(LOG_DIR)
    this.logFile = path.join(LOG_DIR, `${id}.log`)
  }

  private formatMessage(message: any, ...args: any[]): string {
    const timestamp = new Date().toLocaleString()
    let formattedMessage =
      typeof message === 'string' ? message : JSON.stringify(message, null, 2)

    if (args.length > 0) {
      args.forEach((arg) => {
        const argStr =
          typeof arg === 'string' ? arg : JSON.stringify(arg, null, 2)
        formattedMessage += ' ' + argStr
      })
    }

    return `[${timestamp}] [${this.id}] ${formattedMessage}`
  }

  private writeToFile(message: string) {
    try {
      fs.appendFileSync(this.logFile, message + '\n')
      this.emit('log', message)
    } catch (error) {
      console.error('无法写入日志文件:', error)
    }
  }

  log(message: any, ...args: any[]) {
    console.log(message, ...args)
    const fullMessage = this.formatMessage(message, ...args)
    this.writeToFile(fullMessage)
  }

  error(message: any, ...args: any[]) {
    console.error(message, ...args)
    const fullMessage = this.formatMessage(message, ...args)
    this.writeToFile(fullMessage)
  }

  info(message: any, ...args: any[]) {
    this.log(message, ...args)
  }

  warn(message: any, ...args: any[]) {
    console.warn(message, ...args)
    const fullMessage = this.formatMessage(`⚠️ ${message}`, ...args)
    this.writeToFile(fullMessage)
  }

  getLogs(limit: number = 100): string[] {
    try {
      if (!fs.existsSync(this.logFile)) {
        return []
      }
      const content = fs.readFileSync(this.logFile, 'utf-8')
      const lines = content.trim().split('\n').filter(Boolean)
      return lines.slice(-limit)
    } catch (error) {
      console.error('无法读取日志文件:', error)
      return []
    }
  }

  clearLogs() {
    try {
      if (fs.existsSync(this.logFile)) {
        fs.writeFileSync(this.logFile, '')
      }
      this.emit('clear')
    } catch (error) {
      console.error('无法清除日志文件:', error)
    }
  }
}

// Default logger for backward compatibility if needed, or update references
export const logger = new Logger('app')
