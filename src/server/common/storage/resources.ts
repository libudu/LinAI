import type { TemplateValue } from '@/shared/image/template'
import type { StoredItem } from '@/shared/storage/types'
import { randomUUID } from 'crypto'
import { dataPath } from './data-path'
import { storageRegistry } from './registry'

/**
 * 通用存储资源注册：服务端启动时执行一次（由 api/common/storage.ts 与
 * common/template-manager 引用触发）。新增前端业务集合时在此登记即可。
 */

// 旧格式：data/templates.json 为 TaskTemplate 扁平数组，迁移为信封结构
const migrateLegacyTemplates = (raw: unknown): StoredItem<TemplateValue>[] => {
  if (!Array.isArray(raw)) {
    throw new Error('旧模板文件不是数组')
  }
  return raw.map((t) => {
    const record = t as Partial<TemplateValue> & {
      id?: string
      createdAt?: number
    }
    const { id, createdAt, ...value } = record
    return {
      id: typeof id === 'string' ? id : randomUUID(),
      revision: 1,
      createdAt: createdAt ?? Date.now(),
      updatedAt: createdAt ?? Date.now(),
      value: value as TemplateValue,
    }
  })
}

storageRegistry.register<TemplateValue>('image.templates', {
  kind: 'collection',
  file: dataPath('templates.json'),
  migrateLegacy: migrateLegacyTemplates,
})
