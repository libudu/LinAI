import type { StoredEntity } from '@/shared/storage/types'
import type { TTSProject, TTSSummary } from '@/shared/tts/project'
import { dataPath } from '../../common/storage/data-path'
import { readJsonFile } from '../../common/storage/json-file'
import { storageRegistry } from '../../common/storage/registry'

/**
 * TTS 项目通用存储资源注册（tts.projects）。
 * 角色/对白/备注的增删改全部由前端完成，然后整体保存项目
 */

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
