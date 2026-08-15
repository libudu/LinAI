import path from 'path'
import { StorageError } from '../storage/errors'
import { readJsonFileSync, writeJsonFileSync } from '../storage/json-file'

export interface ConfigJsonOptions<T extends object> {
  /** 存储目录（不存在会自动创建） */
  dir: string
  /** 文件名，默认 config.json */
  fileName?: string
  /** 默认配置：文件缺失时写入该默认值，字段缺失时回退到对应默认值 */
  defaults: T
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// 深合并默认值：只补齐缺失字段，文件中已有的值（含数组）以文件为准
const mergeDefaults = <T extends object>(defaults: T, loaded: unknown): T => {
  if (!isPlainObject(loaded)) return { ...defaults }
  const result: Record<string, unknown> = { ...loaded }
  for (const [key, defaultValue] of Object.entries(defaults)) {
    const loadedValue = loaded[key]
    if (loadedValue === undefined) {
      result[key] = defaultValue
    } else if (isPlainObject(defaultValue) && isPlainObject(loadedValue)) {
      result[key] = mergeDefaults(defaultValue, loadedValue)
    }
  }
  return result as T
}

/**
 * 通用 config.json 读写工具：负责目录创建、初始读取（与默认值深合并）、更新落盘。
 * 新增独立模块的配置文件时，new 一个实例即可获得 get/update 能力。
 *
 * 底层使用 storage/json-file 的原子写入：
 * - 写盘失败会抛出 StorageError(WRITE_FAILED)，只有落盘成功才更新内存，杜绝“假成功”；
 * - 文件损坏时原文件被改名为 .corrupt-<时间戳>，回退默认值并保留现场。
 */
export class ConfigJson<T extends object> {
  private readonly configFile: string
  private current: T

  constructor(options: ConfigJsonOptions<T>) {
    const { dir, fileName = 'config.json', defaults } = options
    this.configFile = path.join(dir, fileName)
    this.current = { ...defaults }

    try {
      const loaded = readJsonFileSync<T>(this.configFile)
      if (loaded === undefined) {
        writeJsonFileSync(this.configFile, defaults)
      } else {
        this.current = mergeDefaults(defaults, loaded)
      }
    } catch (error) {
      if (error instanceof StorageError && error.code === 'CORRUPT') {
        // 原文件已被改名为 .corrupt-<时间戳>，回退默认值并尝试落盘
        console.error(
          `[ConfigJson] 配置损坏，回退默认值: ${this.configFile}`,
          error,
        )
        try {
          writeJsonFileSync(this.configFile, this.current)
        } catch (writeError) {
          console.error(
            `[ConfigJson] 回退默认值写入失败: ${this.configFile}`,
            writeError,
          )
        }
      } else {
        // 其他初始化失败不阻断启动，内存中使用默认值，后续 update 会抛错暴露问题
        console.error(`[ConfigJson] 初始化配置失败: ${this.configFile}`, error)
      }
    }
  }

  /** 返回内存配置的深拷贝，调用方无法绕过 update() 直接改内存数据 */
  readonly get = (): T => {
    return structuredClone(this.current)
  }

  /** 更新并落盘；写盘失败抛 StorageError，内存保持不变 */
  readonly update = (newConfig: Partial<T>): T => {
    const next = { ...this.current, ...newConfig }
    writeJsonFileSync(this.configFile, next)
    this.current = next
    return structuredClone(next)
  }
}
