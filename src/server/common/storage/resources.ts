import type { TemplateValue } from '@/shared/image/template'
import type { Novel, NovelSummary } from '@/shared/novel/types'
import type { StoredEntity, StoredItem } from '@/shared/storage/types'
import type { TTSProject, TTSSummary } from '@/shared/tts/project'
import { randomUUID } from 'crypto'
import fsp from 'fs/promises'
import path from 'path'
import { dataPath } from './data-path'
import { readJsonFile } from './json-file'
import { storageRegistry } from './registry'

/**
 * 通用存储资源注册：服务端启动时执行一次（由 api/common/storage.ts 与
 * common/static 引用触发）。新增前端业务集合时在此登记即可。
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

// ---------- 小说：novel.books ----------
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

// ---------- TTS 项目：tts.projects ----------
// 旧布局：data/tts/projects.json 单文件数组；新布局：data/tts/projects/<id>.json。
// 旧文件保留不删（可手动清理）

const LEGACY_PROJECTS_FILE = dataPath('tts', 'projects.json')

const migrateLegacyTtsProjects = async (): Promise<
  StoredEntity<TTSProject, TTSSummary>[]
> => {
  const raw = await readJsonFile<TTSProject[]>(LEGACY_PROJECTS_FILE).catch(
    (error) => {
      console.error(
        `[storage] 旧 TTS 项目迁移跳过: ${LEGACY_PROJECTS_FILE}`,
        error,
      )
      return undefined
    },
  )
  if (!Array.isArray(raw)) return []
  return raw
    .filter((p) => p && typeof p.id === 'string')
    .map((p) => ({
      storageVersion: 1,
      id: p.id,
      revision: 1,
      createdAt: p.createdAt ?? Date.now(),
      updatedAt: p.updatedAt ?? Date.now(),
      summary: { name: p.name ?? '', description: p.description ?? '' },
      value: p,
    }))
}

storageRegistry.register('tts.projects', {
  kind: 'entity',
  dir: dataPath('tts', 'projects'),
  migrateLegacy: migrateLegacyTtsProjects,
})
