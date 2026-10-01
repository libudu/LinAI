import fs from 'fs-extra'
import path from 'path'
import type { ImageDirectoryType, ImageFileInfo } from './index'

type Directory = { dir: string; apiPath: string; type: ImageDirectoryType }
/** 派生的进程内索引：内部写删即时更新，目录变化增量扫描，定期核对外部覆盖。 */
export class ImageFileIndex {
  private files = new Map<string, ImageFileInfo>()
  private stamps = new Map<string, string>()
  private checkedAt = 0
  private epoch = 0
  private initialized = false
  private reading?: Promise<ImageFileInfo[]>
  constructor(private readonly directories: Directory[]) {}

  private key(type: ImageDirectoryType, filename: string) {
    return `${type}/${filename}`
  }
  record(type: ImageDirectoryType, filename: string, createdAt: number) {
    const directory = this.directories.find((item) => item.type === type)!
    this.epoch += 1
    this.files.set(this.key(type, filename), {
      url: `${directory.apiPath}/${filename}`,
      type,
      createdAt,
    })
  }
  remove(type: ImageDirectoryType, filename: string) {
    this.epoch += 1
    this.files.delete(this.key(type, filename))
  }
  snapshot() {
    return [...this.files.values()].sort(
      (a, b) => b.createdAt - a.createdAt || b.url.localeCompare(a.url),
    )
  }

  async list() {
    if (this.reading) return this.reading
    this.reading = this.refresh()
    try {
      return await this.reading
    } finally {
      this.reading = undefined
    }
  }
  private async refresh(): Promise<ImageFileInfo[]> {
    // 扫描期间有内部写删时重取索引，不让旧扫描覆盖新文件。
    while (true) {
      const epoch = this.epoch
      const now = Date.now()
      const full = !this.initialized || now - this.checkedAt >= 30_000
      const next = new Map(this.files)
      const stamps = new Map<string, string>()
      for (const directory of this.directories) {
        const stat = await fs.stat(directory.dir)
        const stamp = `${stat.mtimeMs}:${stat.ctimeMs}`
        stamps.set(directory.type, stamp)
        if (!full && this.stamps.get(directory.type) === stamp) continue
        const entries = await fs.readdir(directory.dir, { withFileTypes: true })
        const keys = new Set<string>()
        // 每批并行处理少量 stat，避免大量文件时耗尽文件句柄。
        for (let offset = 0; offset < entries.length; offset += 32) {
          await Promise.all(
            entries.slice(offset, offset + 32).map(async (entry) => {
              if (!entry.isFile()) return
              const key = this.key(directory.type, entry.name)
              keys.add(key)
              if (!full && next.has(key)) return
              try {
                const info = await fs.stat(path.join(directory.dir, entry.name))
                next.set(key, {
                  url: `${directory.apiPath}/${entry.name}`,
                  type: directory.type,
                  createdAt: info.mtimeMs,
                })
              } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
                  throw error
                next.delete(key)
              }
            }),
          )
        }
        for (const [key, file] of next)
          if (file.type === directory.type && !keys.has(key)) next.delete(key)
      }
      if (epoch !== this.epoch) continue
      this.files = next
      this.stamps = stamps
      this.initialized = true
      if (full) this.checkedAt = now
      return this.snapshot()
    }
  }
}
