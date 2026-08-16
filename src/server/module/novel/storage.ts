import type { Novel, NovelSummary } from '@/shared/novel/types'
import type { StoredEntity } from '@/shared/storage/types'
import fsp from 'fs/promises'
import path from 'path'
import { dataPath } from '../../common/storage/data-path'
import { readJsonFile } from '../../common/storage/json-file'
import { storageRegistry } from '../../common/storage/registry'

/**
 * 小说通用存储资源注册（novel.books）。
 * 章节/文本业务修改与摘要计算全部在前端，一次读改写整体保存；
 * 后端只保存整个实体、检查 revision 和维护信封元数据
 */

// 旧布局：data/novels/<id>/novel.json + index.json；新布局：data/novels/books/<id>.json。
// 迁移在 books 目录首次创建前执行一次（EntityStore.ensureReady），扫描旧目录逐个转换；
// 旧目录保留不删（可手动清理），index.json 自此废弃不再写入
const migrateLegacyNovels = async (): Promise<
  StoredEntity<Novel, NovelSummary>[]
> => {
  const novelsRoot = dataPath('novels')
  const entries = await fsp
    .readdir(novelsRoot, { withFileTypes: true })
    .catch(() => [])
  const entities: StoredEntity<Novel, NovelSummary>[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'books') continue
    const file = path.join(novelsRoot, entry.name, 'novel.json')
    const novel = await readJsonFile<Novel>(file).catch((error) => {
      console.error(`[storage] 旧小说数据迁移跳过: ${file}`, error)
      return undefined
    })
    if (!novel || typeof novel.id !== 'string') continue
    entities.push({
      storageVersion: 1,
      id: novel.id,
      revision: 1,
      createdAt: novel.createdAt ?? Date.now(),
      updatedAt: novel.updatedAt ?? Date.now(),
      summary: {
        title: novel.title ?? '',
        chapterCount: novel.chapters?.length ?? 0,
      },
      value: novel,
    })
  }
  return entities
}

storageRegistry.register('novel.books', {
  kind: 'entity',
  dir: dataPath('novels', 'books'),
  migrateLegacy: migrateLegacyNovels,
})
