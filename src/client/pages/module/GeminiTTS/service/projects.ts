// TTS 项目数据访问层：项目走通用实体接口（tts.projects），
// 角色/对白/备注的增删改全部在前端完成，每次修改整体读改写并携带 expectedRevision
import { entityClient, mutateEntity } from '@/client/service/storage'
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

// 读改写整体保存：通用重试循环收敛在 mutateEntity（storage.ts），此处只做合并修改
export const updateProject = async (
  id: string,
  updates: Partial<Omit<TTSProject, 'id' | 'createdAt'>>,
): Promise<TTSProjectEntity> => {
  const { entity } = await mutateEntity(
    projectsClient,
    id,
    (project) => {
      Object.assign(project, updates, { updatedAt: Date.now() })
    },
    summaryOf,
  )
  return entity
}

export const deleteProject = (id: string): Promise<void> =>
  projectsClient.remove(id)
