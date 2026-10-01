import type { StoredItem } from '@/shared/storage/types'
import { dataPath } from '../../common/storage/data-path'
import { StorageError } from '../../common/storage/errors'
import { storageRegistry } from '../../common/storage/registry'

/** 原设置文档原地迁为单条目集合；只管理信封，业务 value 由前端拥有。 */
const migratePreference = (raw: unknown): StoredItem[] => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new StorageError('CORRUPT', '无法识别的 Eagle 偏好文件')
  const record = raw as Record<string, unknown>
  const value = 'storageVersion' in record ? record.value : record
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new StorageError('CORRUPT', '无法识别的 Eagle 偏好文档')
  const updatedAt = typeof record.updatedAt === 'number' ? record.updatedAt : 0
  return [
    { id: 'preferences', revision: 1, createdAt: updatedAt, updatedAt, value },
  ]
}

for (const name of ['folder-tree', 'manual-folders']) {
  storageRegistry.register(`eagle.${name}`, {
    kind: 'collection',
    file: dataPath('eagle', `${name}.json`),
    migrateLegacy: migratePreference,
  })
}
