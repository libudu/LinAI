import { normalizeComfyBaseUrl } from '@/shared/gpt-image/comfyui'
import type { ComfyEndpoint } from '@/shared/gpt-image/endpoints'
import { randomUUID } from 'crypto'
import fs from 'fs-extra'
import path from 'path'
import { settingsRegistry } from '../../common/settings/registry'
import { dataPath } from '../../common/storage/data-path'
import { readJsonFile, writeJsonFile } from '../../common/storage/json-file'
import type { GptImageSettings } from './settings'

const WORKFLOW_DIR = dataPath('images', 'workflows')
const MARKERS = ['LinAI@prompt', 'LinAI@image1', 'LinAI@output'] as const
export type Marker = (typeof MARKERS)[number]
export type WorkflowNode = {
  inputs: Record<string, unknown>
  class_type: string
  _meta?: { title?: string }
}
export type Workflow = Record<string, WorkflowNode>
export type ValidatedWorkflow = {
  workflow: Workflow
  ids: Record<Marker, string>
}

export function validateWorkflow(raw: unknown): ValidatedWorkflow {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('工作流必须是 ComfyUI API 格式 JSON 对象')
  const entries = Object.entries(raw)
  if (!entries.length || 'nodes' in raw || 'links' in raw)
    throw new Error('请从 ComfyUI 导出 API 格式工作流，而非普通画布 JSON')
  const ids = {} as Record<Marker, string>
  for (const [id, value] of entries) {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      !('inputs' in value) ||
      !('class_type' in value) ||
      !value.inputs ||
      typeof value.inputs !== 'object' ||
      Array.isArray(value.inputs) ||
      typeof value.class_type !== 'string' ||
      !value.class_type.trim()
    ) {
      throw new Error(`节点 ${id} 缺少 API 格式要求的 inputs/class_type`)
    }
    const title = (value as WorkflowNode)._meta?.title
    if (!MARKERS.includes(title as Marker)) continue
    const marker = title as Marker
    if (ids[marker]) throw new Error(`工作流标记 ${marker} 重复`)
    ids[marker] = id
  }
  for (const marker of MARKERS)
    if (!ids[marker]) throw new Error(`工作流缺少标记 ${marker}`)
  const workflow = raw as Workflow
  if (typeof workflow[ids['LinAI@prompt']].inputs.prompt !== 'string')
    throw new Error('LinAI@prompt 节点的 inputs.prompt 必须是字符串')
  if (typeof workflow[ids['LinAI@image1']].inputs.image !== 'string')
    throw new Error('LinAI@image1 节点的 inputs.image 必须是文件名字符串')
  return { workflow, ids }
}

const workflowPath = (id: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('工作流 ID 无效')
  return path.join(WORKFLOW_DIR, `${id}.json`)
}

/** 导入并切换设置引用；新文件写入失败时不会覆盖旧工作流。 */
export async function importComfyWorkflow(input: {
  endpointId?: string
  title: string
  baseUrl: string
  workflowName: string
  content: string
}) {
  const baseUrl = normalizeComfyBaseUrl(input.baseUrl)
  const title = input.title.trim()
  if (!title) throw new Error('请输入接入点名称')
  let parsed: unknown
  try {
    parsed = JSON.parse(input.content)
  } catch {
    throw new Error('工作流不是有效 JSON')
  }
  validateWorkflow(parsed)
  const snapshot = await settingsRegistry.get<GptImageSettings>('gpt-image')
  const existing = input.endpointId
    ? snapshot.value.gptImageComfyEndpoints.find(
        (item) => item.id === input.endpointId,
      )
    : undefined
  if (input.endpointId && !existing)
    throw new Error('要更新的 ComfyUI 接入点不存在')
  const workflowId = randomUUID()
  const endpoint: ComfyEndpoint = {
    id: existing?.id ?? randomUUID(),
    protocol: 'comfyui',
    title,
    baseUrl,
    workflowId,
    workflowName: input.workflowName.trim() || '工作流',
  }
  const file = workflowPath(workflowId)
  await writeJsonFile(file, parsed, { backup: false })
  try {
    await settingsRegistry.put<GptImageSettings>(
      'gpt-image',
      {
        ...snapshot.value,
        gptImageEndpointKind: 'comfyui',
        gptImageEndpointId: endpoint.id,
        gptImageComfyEndpoints: existing
          ? snapshot.value.gptImageComfyEndpoints.map((item) =>
              item.id === endpoint.id ? endpoint : item,
            )
          : [...snapshot.value.gptImageComfyEndpoints, endpoint],
      },
      snapshot.revision,
    )
  } catch (error) {
    await fs.remove(file).catch(() => undefined)
    throw error
  }
  if (existing)
    await fs.remove(workflowPath(existing.workflowId)).catch(() => undefined)
  return endpoint
}

export async function loadComfyWorkflow(
  workflowId: string,
): Promise<ValidatedWorkflow> {
  const raw = await readJsonFile<unknown>(workflowPath(workflowId))
  if (!raw) throw new Error('工作流文件已删除，请重新导入')
  return validateWorkflow(raw)
}
