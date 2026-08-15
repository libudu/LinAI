// TTS 项目数据访问层：项目走通用实体接口（tts.projects），
// 角色/对白/备注的增删改全部在前端完成，每次修改整体读改写并携带 expectedRevision
import { StorageApiError, entityClient } from '@/client/service/storage'
import type { TTSProject, TTSSummary } from '@/server/module/tts'
import type { StoredEntity } from '@/shared/storage/types'

const projectsClient = entityClient<TTSProject, TTSSummary>('tts.projects')

export type TTSProjectEntity = StoredEntity<TTSProject, TTSSummary>

// 项目列表项（EntityStore 摘要 + 信封元数据，够卡片渲染即可）
export interface TTSProjectListItem {
  id: string
  name: string
  description: string
  createdAt: number
  updatedAt: number
}

const summaryOf = (project: TTSProject): TTSSummary => ({
  name: project.name,
  description: project.description,
})

export const listProjects = async (): Promise<TTSProjectListItem[]> => {
  const items = await projectsClient.list()
  return items.map((e) => ({
    id: e.id,
    name: e.summary.name,
    description: e.summary.description,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  }))
}

export const getProject = (id: string): Promise<TTSProjectEntity> =>
  projectsClient.get(id)

export const createProject = async (input: {
  name: string
  description?: string
}): Promise<TTSProjectEntity> => {
  const now = Date.now()
  const project: TTSProject = {
    id: crypto.randomUUID(),
    name: input.name,
    description: input.description || '',
    characters: [],
    dialogues: [],
    createdAt: now,
    updatedAt: now,
  }
  return projectsClient.create(project, summaryOf(project), project.id)
}

// 读改写整体保存：GET 实体 → 前端合并修改 → 携带 expectedRevision 整体 PUT。
// 版本冲突（其他页面改过）时重取实体重放一次修改，仍冲突则抛错提示刷新
export const updateProject = async (
  id: string,
  updates: Partial<Omit<TTSProject, 'id' | 'createdAt'>>,
): Promise<TTSProjectEntity> => {
  for (let attempt = 0; attempt < 2; attempt++) {
    const entity = await projectsClient.get(id)
    const project: TTSProject = {
      ...structuredClone(entity.value),
      ...updates,
      updatedAt: Date.now(),
    }
    try {
      return await projectsClient.replace(
        id,
        project,
        summaryOf(project),
        entity.revision,
      )
    } catch (error) {
      const conflict =
        error instanceof StorageApiError && error.code === 'REVISION_CONFLICT'
      if (!conflict || attempt === 1) throw error
    }
  }
  throw new Error('unreachable')
}

export const deleteProject = (id: string): Promise<void> =>
  projectsClient.remove(id)
