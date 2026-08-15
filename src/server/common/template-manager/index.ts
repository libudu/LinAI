import type { TaskTemplate, TemplateValue } from '@/shared/image/template'
import type { StoredItem } from '@/shared/storage/types'
import { StorageError } from '../storage/errors'
import { storageRegistry } from '../storage/registry'
// 注册通用存储资源（副作用）
import '../storage/resources'

export type { TaskTemplate } from '@/shared/image/template'

// 信封条目转回旧版扁平结构（兼容 /api/template 与任务快照）
const flatten = (item: StoredItem<TemplateValue>): TaskTemplate => ({
  id: item.id,
  createdAt: item.createdAt,
  ...item.value,
})

const store = () =>
  storageRegistry.getCollection<TemplateValue>('image.templates')

/**
 * 旧版模板管理接口的兼容适配器：底层已迁移到通用 CollectionStore
 * （data/templates.json，原子写入 + 串行队列 + revision），
 * 前端新代码请直接使用 /api/storage/collections/image.templates。
 */
class TemplateManager {
  private readonly ready: Promise<void>

  constructor() {
    this.ready = this.seed()
  }

  // 仅在文件尚不存在（revision 0 且无条目）时写入示例模板
  private async seed() {
    const snapshot = await store().getSnapshot()
    if (snapshot.revision === 0 && snapshot.items.length === 0) {
      await store().create({
        title: '模板示例1',
        images: [],
        prompt: '生成一张2030年福瑞（furry）科目的中考试卷',
      })
    }
  }

  public async getTemplates(): Promise<TaskTemplate[]> {
    await this.ready
    const snapshot = await store().getSnapshot()
    return snapshot.items.map(flatten)
  }

  public async addTemplate(
    template: Omit<TaskTemplate, 'id' | 'createdAt'>,
  ): Promise<TaskTemplate> {
    await this.ready
    const item = await store().create({
      ...template,
      images: template.images || [],
    })
    return flatten(item)
  }

  public async deleteTemplate(id: string): Promise<boolean> {
    await this.ready
    try {
      await store().remove(id)
      return true
    } catch (error) {
      if (error instanceof StorageError && error.code === 'NOT_FOUND') {
        return false
      }
      throw error
    }
  }

  public async updateTemplate(
    id: string,
    updates: Partial<TemplateValue>,
  ): Promise<TaskTemplate | null> {
    await this.ready
    const snapshot = await store().getSnapshot()
    const item = snapshot.items.find((i) => i.id === id)
    if (!item) {
      return null
    }
    const updated = await store().replace(id, { ...item.value, ...updates })
    return flatten(updated)
  }

  public async renameFolder(
    oldFolder: string,
    newFolder: string,
  ): Promise<number> {
    await this.ready
    const snapshot = await store().getSnapshot()
    const targets = snapshot.items.filter((i) => i.value.folder === oldFolder)
    if (targets.length === 0) {
      return 0
    }
    await store().batch(
      targets.map((i) => ({
        type: 'replace' as const,
        id: i.id,
        value: { ...i.value, folder: newFolder },
      })),
    )
    return targets.length
  }
}

export const templateManager = new TemplateManager()
