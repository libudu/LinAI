import fs from 'fs-extra'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import type {
  Novel,
  NovelChapter,
  NovelIndexItem,
  NovelRef,
  NovelSetting,
} from './types'

// data/novels/ 布局：index.json + <novelId>/novel.json + <novelId>/refs/<refId>.txt
// 写入策略与 template-manager 一致：变更即整体写回 novel.json；参考文内容单独存 .txt
class NovelStore {
  private novelsDir = path.join(process.cwd(), 'data', 'novels')
  private indexFile = path.join(this.novelsDir, 'index.json')
  // 内存缓存，写文件时同步更新
  private cache = new Map<string, Novel>()

  constructor() {
    fs.ensureDirSync(this.novelsDir)
    if (!fs.existsSync(this.indexFile)) {
      fs.writeFileSync(this.indexFile, JSON.stringify([]), 'utf-8')
    }
  }

  private novelDir(id: string) {
    return path.join(this.novelsDir, id)
  }

  private novelFile(id: string) {
    return path.join(this.novelDir(id), 'novel.json')
  }

  private refsDir(id: string) {
    return path.join(this.novelDir(id), 'refs')
  }

  private async readIndex(): Promise<NovelIndexItem[]> {
    try {
      const data = await fs.readFile(this.indexFile, 'utf-8')
      return JSON.parse(data)
    } catch (error) {
      console.error('[小说] 读取书籍索引失败:', error)
      return []
    }
  }

  private async writeIndex(items: NovelIndexItem[]) {
    await fs.writeFile(this.indexFile, JSON.stringify(items, null, 2), 'utf-8')
  }

  // 书数据变更即整体写回 novel.json，并同步索引项
  private async writeNovel(novel: Novel) {
    novel.updatedAt = Date.now()
    this.cache.set(novel.id, novel)
    await fs.ensureDir(this.novelDir(novel.id))
    await fs.writeFile(
      this.novelFile(novel.id),
      JSON.stringify(novel, null, 2),
      'utf-8',
    )
    const index = await this.readIndex()
    const entry: NovelIndexItem = {
      id: novel.id,
      title: novel.title,
      createdAt: novel.createdAt,
      updatedAt: novel.updatedAt,
      chapterCount: novel.chapters.length,
    }
    const i = index.findIndex((item) => item.id === novel.id)
    if (i === -1) {
      index.push(entry)
    } else {
      index[i] = entry
    }
    await this.writeIndex(index)
  }

  async listNovels(): Promise<NovelIndexItem[]> {
    const index = await this.readIndex()
    return index.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  async createNovel(title: string, recentFullChapters: number): Promise<Novel> {
    const now = Date.now()
    const novel: Novel = {
      id: uuidv4(),
      title,
      refs: [],
      settings: [],
      chapters: [],
      recentFullChapters,
      createdAt: now,
      updatedAt: now,
    }
    await fs.ensureDir(this.refsDir(novel.id))
    await this.writeNovel(novel)
    return novel
  }

  async getNovel(id: string): Promise<Novel | null> {
    const cached = this.cache.get(id)
    if (cached) return cached
    try {
      const data = await fs.readFile(this.novelFile(id), 'utf-8')
      const novel = JSON.parse(data) as Novel
      this.cache.set(id, novel)
      return novel
    } catch {
      return null
    }
  }

  async updateNovel(
    id: string,
    updates: { title?: string; recentFullChapters?: number },
  ): Promise<Novel | null> {
    const novel = await this.getNovel(id)
    if (!novel) return null
    if (updates.title !== undefined) novel.title = updates.title
    if (updates.recentFullChapters !== undefined) {
      novel.recentFullChapters = updates.recentFullChapters
    }
    await this.writeNovel(novel)
    return novel
  }

  // 删书（含整个目录）
  async deleteNovel(id: string): Promise<boolean> {
    const novel = await this.getNovel(id)
    if (!novel) return false
    this.cache.delete(id)
    await fs.remove(this.novelDir(id))
    const index = await this.readIndex()
    await this.writeIndex(index.filter((item) => item.id !== id))
    return true
  }

  // 上传参考文：截断与总量校验已前移到前端，服务端只按收到的内容落盘并记录元数据
  async addRef(
    id: string,
    title: string,
    content: string,
    originalLength?: number,
  ): Promise<NovelRef | null> {
    const novel = await this.getNovel(id)
    if (!novel) return null
    const ref: NovelRef = {
      id: uuidv4(),
      title,
      fileName: '',
      originalLength: originalLength ?? content.length,
      storedLength: content.length,
      truncated: (originalLength ?? content.length) > content.length,
      createdAt: Date.now(),
    }
    ref.fileName = `${ref.id}.txt`
    await fs.ensureDir(this.refsDir(id))
    await fs.writeFile(
      path.join(this.refsDir(id), ref.fileName),
      content,
      'utf-8',
    )
    novel.refs.push(ref)
    await this.writeNovel(novel)
    return ref
  }

  async deleteRef(id: string, refId: string): Promise<boolean> {
    const novel = await this.getNovel(id)
    if (!novel) return false
    const ref = novel.refs.find((r) => r.id === refId)
    if (!ref) return false
    novel.refs = novel.refs.filter((r) => r.id !== refId)
    await fs.remove(path.join(this.refsDir(id), ref.fileName))
    await this.writeNovel(novel)
    return true
  }

  async getRefContent(id: string, refId: string): Promise<string | null> {
    const novel = await this.getNovel(id)
    const ref = novel?.refs.find((r) => r.id === refId)
    if (!ref) return null
    try {
      return await fs.readFile(
        path.join(this.refsDir(id), ref.fileName),
        'utf-8',
      )
    } catch {
      return null
    }
  }

  async addSetting(
    id: string,
    title: string,
    content: string,
  ): Promise<NovelSetting | null> {
    const novel = await this.getNovel(id)
    if (!novel) return null
    const setting: NovelSetting = {
      id: uuidv4(),
      title,
      content,
      createdAt: Date.now(),
    }
    novel.settings.push(setting)
    await this.writeNovel(novel)
    return setting
  }

  async updateSetting(
    id: string,
    sid: string,
    updates: { title?: string; content?: string },
  ): Promise<NovelSetting | null> {
    const novel = await this.getNovel(id)
    if (!novel) return null
    const setting = novel.settings.find((s) => s.id === sid)
    if (!setting) return null
    if (updates.title !== undefined) setting.title = updates.title
    if (updates.content !== undefined) setting.content = updates.content
    await this.writeNovel(novel)
    return setting
  }

  async deleteSetting(id: string, sid: string): Promise<boolean> {
    const novel = await this.getNovel(id)
    if (!novel) return false
    if (!novel.settings.some((s) => s.id === sid)) return false
    novel.settings = novel.settings.filter((s) => s.id !== sid)
    await this.writeNovel(novel)
    return true
  }

  // 新增空白章节（生成下一章大纲前创建）
  async addChapter(id: string): Promise<NovelChapter | null> {
    const novel = await this.getNovel(id)
    if (!novel) return null
    const now = Date.now()
    const chapter: NovelChapter = {
      id: uuidv4(),
      index: novel.chapters.length
        ? Math.max(...novel.chapters.map((c) => c.index)) + 1
        : 1,
      title: '',
      outline: null,
      outlineContext: null,
      content: '',
      contentContext: null,
      summary: '',
      status: 'outlining',
      createdAt: now,
      updatedAt: now,
    }
    novel.chapters.push(chapter)
    await this.writeNovel(novel)
    return chapter
  }

  async updateChapter(
    id: string,
    cid: string,
    updates: Partial<
      Pick<
        NovelChapter,
        | 'title'
        | 'outline'
        | 'outlineContext'
        | 'content'
        | 'contentContext'
        | 'summary'
        | 'status'
      >
    >,
  ): Promise<NovelChapter | null> {
    const novel = await this.getNovel(id)
    if (!novel) return null
    const chapter = novel.chapters.find((c) => c.id === cid)
    if (!chapter) return null
    Object.assign(chapter, updates)
    chapter.updatedAt = Date.now()
    await this.writeNovel(novel)
    return chapter
  }

  // 仅允许删除最后一章，避免序号空洞
  async deleteChapter(id: string, cid: string): Promise<boolean> {
    const novel = await this.getNovel(id)
    if (!novel) return false
    const chapter = novel.chapters.find((c) => c.id === cid)
    if (!chapter) return false
    const maxIndex = Math.max(...novel.chapters.map((c) => c.index))
    if (chapter.index !== maxIndex) {
      throw new Error('[小说] 仅支持删除最后一章')
    }
    novel.chapters = novel.chapters.filter((c) => c.id !== cid)
    await this.writeNovel(novel)
    return true
  }
}

export const novelStore = new NovelStore()
