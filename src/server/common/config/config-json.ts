import fs from 'fs'
import path from 'path'

export interface ConfigJsonOptions<T extends object> {
  /** 存储目录（不存在会自动创建） */
  dir: string
  /** 文件名，默认 config.json */
  fileName?: string
  /** 默认配置：文件缺失时写入该默认值，字段缺失时回退到对应默认值 */
  defaults: T
}

/**
 * 通用 config.json 读写工具：负责目录创建、初始读取（与默认值合并）、更新落盘。
 * 新增独立模块的配置文件时，new 一个实例即可获得 get/update 能力。
 */
export class ConfigJson<T extends object> {
  private readonly configFile: string
  private current: T

  constructor(options: ConfigJsonOptions<T>) {
    const { dir, fileName = 'config.json', defaults } = options
    this.configFile = path.join(dir, fileName)
    this.current = { ...defaults }

    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      if (fs.existsSync(this.configFile)) {
        const fileContent = fs.readFileSync(this.configFile, 'utf-8')
        this.current = { ...defaults, ...JSON.parse(fileContent) }
      } else {
        fs.writeFileSync(
          this.configFile,
          JSON.stringify(defaults, null, 2),
          'utf-8',
        )
      }
    } catch (error) {
      console.error(`[ConfigJson] 初始化配置失败: ${this.configFile}`, error)
    }
  }

  readonly get = (): T => {
    return this.current
  }

  readonly update = (newConfig: Partial<T>): T => {
    this.current = { ...this.current, ...newConfig }
    try {
      fs.writeFileSync(
        this.configFile,
        JSON.stringify(this.current, null, 2),
        'utf-8',
      )
    } catch (error) {
      console.error(`[ConfigJson] 写入配置失败: ${this.configFile}`, error)
    }
    return this.current
  }
}
