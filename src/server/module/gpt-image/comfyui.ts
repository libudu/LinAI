import type { ComfyEndpoint } from '@/shared/gpt-image/endpoints'
import type { TaskInputSnapshot } from '@/shared/image/template'
import { randomUUID } from 'crypto'
import fs from 'fs-extra'
import path from 'path'
import sharp from 'sharp'
import { settingsRegistry } from '../../common/settings/registry'
import { GENERATED_IMAGES_DIR, INPUT_IMAGES_DIR } from '../../common/static'
import {
  GENERATED_IMAGES_API_PATH,
  INPUT_IMAGES_API_PATH,
} from '../../common/static/enum'
import { dataPath } from '../../common/storage/data-path'
import { readJsonFile, writeJsonFile } from '../../common/storage/json-file'
import { taskService } from '../../common/task'
import { COMFY_IMAGE_SOURCE } from './enum'
import { GptImageSettings, getComfyEndpoint } from './settings'

const WORKFLOW_DIR = dataPath('images', 'workflows')
const MARKERS = ['LinAI@prompt', 'LinAI@image1', 'LinAI@output'] as const
type Marker = (typeof MARKERS)[number]
type WorkflowNode = {
  inputs: Record<string, unknown>
  class_type: string
  _meta?: { title?: string }
}
type Workflow = Record<string, WorkflowNode>

export function validateComfyBaseUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('ComfyUI 地址不是有效 URL')
  }
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== '/' && url.pathname !== '')
  ) {
    throw new Error('ComfyUI 地址仅允许本机 HTTP 回环地址及端口')
  }
  return url.origin
}

export function validateWorkflow(raw: unknown): {
  workflow: Workflow
  ids: Record<Marker, string>
} {
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
  const baseUrl = validateComfyBaseUrl(input.baseUrl)
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

const checkedInputPath = async (images: string[]): Promise<string> => {
  if (images.length !== 1) throw new Error('ComfyUI 生成必须恰好提供一张参考图')
  const match = images[0].match(
    /^\/api\/static\/images\/input\/([a-z0-9_-]+\.(?:webp|png|jpe?g))$/i,
  )
  if (!match || !images[0].startsWith(`${INPUT_IMAGES_API_PATH}/`))
    throw new Error('参考图必须是 LinAI 已保存的输入图片')
  const file = path.join(INPUT_IMAGES_DIR, match[1])
  if (!(await fs.pathExists(file)))
    throw new Error('参考图文件不存在，请重新上传')
  return file
}

const request = async (url: string, init?: RequestInit, timeout = 30000) => {
  try {
    return await fetch(url, {
      ...init,
      redirect: 'error',
      signal: AbortSignal.timeout(timeout),
    })
  } catch (error) {
    throw new Error(
      `无法连接本地 ComfyUI：${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

const responseJson = async (
  response: Response,
  stage: string,
): Promise<any> => {
  const text = await response.text()
  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`${stage} 返回非 JSON：HTTP ${response.status}`)
  }
  if (
    !response.ok ||
    data?.error ||
    (data?.node_errors && Object.keys(data.node_errors).length)
  ) {
    throw new Error(
      `${stage} 失败：${JSON.stringify(data?.error || data?.node_errors || data).slice(0, 1000)}`,
    )
  }
  return data
}

const waitHistory = async (baseUrl: string, promptId: string) => {
  const deadline = Date.now() + 10 * 60 * 1000
  while (Date.now() < deadline) {
    const response = await request(
      `${baseUrl}/history/${encodeURIComponent(promptId)}`,
    )
    const data = await responseJson(response, '查询历史')
    const item = data?.[promptId]
    if (item) {
      const status = item.status
      if (status?.status_str === 'error' || status?.completed === false) {
        const detail = status?.messages?.find(
          (message: unknown[]) => message[0] === 'execution_error',
        )?.[1]
        throw new Error(
          `ComfyUI 节点执行失败：${JSON.stringify(detail || status).slice(0, 1000)}`,
        )
      }
      if (status?.completed || status?.status_str === 'success') return item
      if (!status && item.outputs) return item
    }
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  throw new Error('等待 ComfyUI 工作流超时（10 分钟）')
}

async function runComfyTask(
  taskId: string,
  snapshot: TaskInputSnapshot,
  endpoint: ComfyEndpoint,
  inputPath: string,
  workflow: Workflow,
  ids: Record<Marker, string>,
) {
  const saved: string[] = []
  const start = Date.now()
  try {
    if (!(await taskService.updateActiveTask(taskId, { status: 'running' })))
      return
    const baseUrl = validateComfyBaseUrl(endpoint.baseUrl)
    const upload = new FormData()
    const image = await fs.readFile(inputPath)
    const extension = path.extname(inputPath).toLowerCase()
    const mimeType =
      extension === '.png'
        ? 'image/png'
        : extension === '.jpg' || extension === '.jpeg'
          ? 'image/jpeg'
          : 'image/webp'
    upload.append(
      'image',
      new Blob([new Uint8Array(image)], { type: mimeType }),
      path.basename(inputPath),
    )
    upload.append('overwrite', 'false')
    const uploaded = await responseJson(
      await request(`${baseUrl}/upload/image`, {
        method: 'POST',
        body: upload,
      }),
      '参考图上传',
    )
    if (typeof uploaded?.name !== 'string' || !uploaded.name)
      throw new Error('ComfyUI 上传未返回图片文件名')
    const copy = structuredClone(workflow)
    copy[ids['LinAI@prompt']].inputs.prompt = snapshot.prompt
    copy[ids['LinAI@image1']].inputs.image = uploaded.name
    const submitted = await responseJson(
      await request(`${baseUrl}/prompt`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: copy, client_id: randomUUID() }),
      }),
      '工作流提交',
    )
    if (typeof submitted?.prompt_id !== 'string' || !submitted.prompt_id)
      throw new Error('ComfyUI 未返回 prompt_id')
    if (
      !(await taskService.updateActiveTask(taskId, {
        comfyPromptId: submitted.prompt_id,
      }))
    )
      return
    const history = await waitHistory(baseUrl, submitted.prompt_id)
    const images = history?.outputs?.[ids['LinAI@output']]?.images
    if (!Array.isArray(images) || !images.length)
      throw new Error('LinAI@output 节点没有输出图片，请检查工作流最终保存节点')
    for (const item of images) {
      if (
        typeof item?.filename !== 'string' ||
        !item.filename ||
        typeof item?.subfolder !== 'string' ||
        typeof item?.type !== 'string' ||
        item.type !== 'output'
      ) {
        throw new Error('ComfyUI 输出图片信息无效')
      }
      const view = new URL(`${baseUrl}/view`)
      view.searchParams.set('filename', item.filename)
      view.searchParams.set('subfolder', item.subfolder)
      view.searchParams.set('type', item.type)
      const response = await request(view.href)
      if (!response.ok)
        throw new Error(`下载 ComfyUI 输出图片失败：HTTP ${response.status}`)
      const bytes = Buffer.from(await response.arrayBuffer())
      if (bytes.length > 50 * 1024 * 1024)
        throw new Error('ComfyUI 输出图片超过 50 MB')
      let format: string | undefined
      try {
        format = (await sharp(bytes).metadata()).format
      } catch {
        throw new Error('ComfyUI 输出不是有效图片')
      }
      const ext = format === 'jpeg' ? 'jpg' : format
      if (!ext || !['png', 'jpg', 'webp'].includes(ext))
        throw new Error('ComfyUI 输出图片格式仅支持 PNG、JPEG、WebP')
      const filename = `${randomUUID()}.${ext}`
      saved.push(filename)
      await fs.writeFile(path.join(GENERATED_IMAGES_DIR, filename), bytes)
    }
    const completed = await taskService.updateActiveTask(taskId, {
      status: 'completed',
      duration: Date.now() - start,
      outputUrls: saved.map((file) => `${GENERATED_IMAGES_API_PATH}/${file}`),
    })
    if (completed) return
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    await taskService
      .updateActiveTask(taskId, { status: 'failed', error: reason })
      .catch(console.error)
  }
  await Promise.all(
    saved.map((file) =>
      fs.remove(path.join(GENERATED_IMAGES_DIR, file)).catch(console.error),
    ),
  )
}

export async function submitComfyTask(
  snapshot: TaskInputSnapshot,
  endpointId?: string | null,
) {
  if (!snapshot.prompt.trim()) throw new Error('请填写提示词')
  const inputPath = await checkedInputPath(snapshot.images)
  const endpoint = await getComfyEndpoint(endpointId)
  validateComfyBaseUrl(endpoint.baseUrl)
  const raw = await readJsonFile<unknown>(workflowPath(endpoint.workflowId))
  if (!raw) throw new Error('工作流文件已删除，请重新导入')
  const { workflow, ids } = validateWorkflow(raw)
  const task = await taskService.createTaskFromSnapshot({
    snapshot,
    source: COMFY_IMAGE_SOURCE,
    metadata: {
      comfyEndpointId: endpoint.id,
      comfyWorkflowId: endpoint.workflowId,
    },
  })
  void runComfyTask(task.id, snapshot, endpoint, inputPath, workflow, ids)
  return task.id
}
