import fs from 'fs-extra'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import type {
  Novel,
  NovelChapter,
  NovelIndexItem,
  NovelText,
  NovelTextType,
} from './types'

// data/novels/ 布局：index.json + <novelId>/novel.json（全部文本内联，单文件）
// 写入策略与 template-manager 一致：变更即整体写回 novel.json
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
      chapters: [],
      texts: [],
      recentFullChapters,
      createdAt: now,
      updatedAt: now,
    }
    await fs.ensureDir(this.novelDir(novel.id))
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

  // ---------- 统一文本 CRUD ----------

  async createText(
    id: string,
    input: {
      type: NovelTextType
      chapterId?: string
      title?: string
      content: string
      sourceIds?: string[]
      estimatedTokens?: number
      originalLength?: number
    },
  ): Promise<NovelText | null> {
    const novel = await this.getNovel(id)
    if (!novel) return null
    const now = Date.now()
    const text: NovelText = {
      id: uuidv4(),
      type: input.type,
      title: input.title ?? '',
      content: input.content,
      sourceIds: input.sourceIds ?? [],
      createdAt: now,
      updatedAt: now,
    }
    if (input.chapterId) text.chapterId = input.chapterId
    if (input.estimatedTokens !== undefined) {
      text.estimatedTokens = input.estimatedTokens
    }
    if (input.originalLength !== undefined) {
      text.originalLength = input.originalLength
    }
    novel.texts.push(text)
    await this.writeNovel(novel)
    return text
  }

  async updateText(
    id: string,
    textId: string,
    updates: { title?: string; content?: string; sourceIds?: string[] },
  ): Promise<NovelText | null> {
    const novel = await this.getNovel(id)
    if (!novel) return null
    const text = novel.texts.find((t) => t.id === textId)
    if (!text) return null
    if (updates.title !== undefined) text.title = updates.title
    if (updates.content !== undefined) text.content = updates.content
    if (updates.sourceIds !== undefined) text.sourceIds = updates.sourceIds
    text.updatedAt = Date.now()
    await this.writeNovel(novel)
    return text
  }

  async deleteText(id: string, textId: string): Promise<boolean> {
    const novel = await this.getNovel(id)
    if (!novel) return false
    if (!novel.texts.some((t) => t.id === textId)) return false
    novel.texts = novel.texts.filter((t) => t.id !== textId)
    await this.writeNovel(novel)
    return true
  }

  // ---------- 章节（轻量分组容器） ----------

  // 新增空白章节（生成下一章大纲前创建）
  async addChapter(id: string): Promise<NovelChapter | null> {
    const novel = await this.getNovel(id)
    if (!novel) return null
    const now = Date.now()
    const chapter: NovelChapter = {
      id: uuidv4(),
      title: '',
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
    updates: { title?: string },
  ): Promise<NovelChapter | null> {
    const novel = await this.getNovel(id)
    if (!novel) return null
    const chapter = novel.chapters.find((c) => c.id === cid)
    if (!chapter) return null
    if (updates.title !== undefined) chapter.title = updates.title
    chapter.updatedAt = Date.now()
    await this.writeNovel(novel)
    return chapter
  }

  // 删章节并级联删除其归属文本（「仅可删最后一章」的规则由前端控制）
  async deleteChapter(id: string, cid: string): Promise<boolean> {
    const novel = await this.getNovel(id)
    if (!novel) return false
    if (!novel.chapters.some((c) => c.id === cid)) return false
    novel.chapters = novel.chapters.filter((c) => c.id !== cid)
    novel.texts = novel.texts.filter((t) => t.chapterId !== cid)
    await this.writeNovel(novel)
    return true
  }
}

export const novelStore = new NovelStore()
