import type { TemplateValue } from '@/shared/image/template'
import type { StoredItem } from '@/shared/storage/types'
import { randomUUID } from 'crypto'
import { dataPath } from '../../common/storage/data-path'
import { storageRegistry } from '../../common/storage/registry'

/**
 * 图片模板通用存储资源注册（image.templates）。
 * 模板是前端拥有的数据：字段与文件夹重命名等逻辑全在前端，后端只管信封元数据
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

storageRegistry.register('image.templates', {
  kind: 'collection',
  file: dataPath('templates.json'),
  migrateLegacy: migrateLegacyTemplates,
})
