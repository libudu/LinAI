import { normalizeComfyBaseUrl } from '@/shared/gpt-image/comfyui'
import type { ComfyEndpoint } from '@/shared/gpt-image/endpoints'
import type { TaskInputSnapshot } from '@/shared/image/template'
import { randomBytes, randomUUID } from 'crypto'
import fs from 'fs-extra'
import path from 'path'
import sharp from 'sharp'
import { GENERATED_IMAGES_DIR, INPUT_IMAGES_DIR } from '../../common/static'
import {
  GENERATED_IMAGES_API_PATH,
  INPUT_IMAGES_API_PATH,
} from '../../common/static/enum'
import { taskService } from '../../common/task'
import {
  loadComfyWorkflow,
  type Workflow,
  type WorkflowMarkerIds,
} from './comfyui-workflow'
import { COMFY_IMAGE_SOURCE } from './enum'
import { getComfyEndpoint } from './settings'
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

const request = async (url: string, init?: RequestInit) => {
  try {
    return await fetch(url, {
      ...init,
      redirect: 'error',
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
  // ComfyUI 可能长时间排队，持续等待工作流完成或明确失败。
  while (true) {
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
}

async function runComfyTask(
  taskId: string,
  snapshot: TaskInputSnapshot,
  endpoint: ComfyEndpoint,
  inputPath: string,
  workflow: Workflow,
  ids: WorkflowMarkerIds,
) {
  const saved: string[] = []
  const start = Date.now()
  try {
    if (!(await taskService.updateActiveTask(taskId, { status: 'running' })))
      return
    const baseUrl = normalizeComfyBaseUrl(endpoint.baseUrl)
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
    const seedId = ids['LinAI@seed']
    if (seedId)
      copy[seedId].inputs.seed = Number(
        randomBytes(8).readBigUInt64BE() & BigInt(Number.MAX_SAFE_INTEGER),
      )
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
  normalizeComfyBaseUrl(endpoint.baseUrl)
  const { workflow, ids } = await loadComfyWorkflow(endpoint.workflowId)
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
