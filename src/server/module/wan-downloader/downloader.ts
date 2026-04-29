import axios from 'axios'
import fs from 'fs-extra'
import path from 'path'
import { logger } from '../utils/logger'
import { config } from './config'
import type { TaskData } from './types'

export class Downloader {
  private records: Record<string, any> = {}

  constructor() {
    this.loadRecords()
    fs.ensureDirSync(config.DOWNLOAD_DIR)
  }

  private loadRecords() {
    if (fs.existsSync(config.RECORD_FILE)) {
      try {
        this.records = fs.readJsonSync(config.RECORD_FILE)
      } catch (e) {
        this.records = {}
      }
    }
  }

  private saveRecords() {
    fs.writeJsonSync(config.RECORD_FILE, this.records, { spaces: 2 })
  }

  async downloadVideo(task: TaskData): Promise<boolean> {
    if (this.records[task.taskId]) {
      return false
    }

    const result = task.taskResult?.[0]
    if (!result || !result.downloadUrl) {
      return false
    }

    const videoUrl = result.downloadUrl
    const fileName = `${task.taskId}.mp4`
    const filePath = path.join(config.DOWNLOAD_DIR, fileName)

    logger.log(`📥 正在下载视频: ${task.taskId}...`)
    try {
      const response = await axios({
        url: videoUrl,
        method: 'GET',
        responseType: 'stream',
      })

      const writer = fs.createWriteStream(filePath)
      response.data.pipe(writer)

      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          this.records[task.taskId] = {
            taskId: task.taskId,
            prompt: task.taskInput.prompt,
            downloadUrl: videoUrl,
            gmtCreate: task.gmtCreate,
            filePath: filePath,
          }
          this.saveRecords()
          logger.log(`✅ 视频下载完成: ${fileName} ✨`)
          resolve(true)
        })
        writer.on('error', (err) => {
          logger.error(`❌ 下载失败: ${task.taskId}`, err.message)
          reject(err)
        })
      })
    } catch (error: any) {
      logger.error(`❌ 下载请求失败: ${task.taskId}`, error.message)
      return false
    }
  }
}
