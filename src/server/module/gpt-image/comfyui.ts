import { normalizeComfyBaseUrl } from '@/shared/gpt-image/comfyui'
import type { TaskInputSnapshot } from '@/shared/image/template'
import { randomBytes, randomUUID } from 'crypto'
import fs from 'fs-extra'
import path from 'path'
import sharp from 'sharp'
import { setTimeout as sleep } from 'timers/promises'
import { GENERATED_IMAGES_DIR, INPUT_IMAGES_DIR } from '../../common/static'
import {
  GENERATED_IMAGES_API_PATH,
  INPUT_IMAGES_API_PATH,
} from '../../common/static/enum'
import { taskService, type Task } from '../../common/task'
import {
  loadComfyWorkflow,
  type Workflow,
  type WorkflowMarkerIds,
} from './comfyui-workflow'
import { COMFY_IMAGE_SOURCE } from './enum'
import { getComfyEndpoint } from './settings'

interface ComfyTaskRun {
  baseUrl: string
  promptId: string
  controller: AbortController
  submission?: Promise<any>
  cancelRequested: boolean
  cancelPromise?: Promise<void>
}

const activeRuns = new Map<string, ComfyTaskRun>()

class ComfyTaskCancelled extends Error {}

const waitForCancellation = async (run: ComfyTaskRun) => {
  if (run.cancelRequested) await run.cancelPromise?.catch(() => {})
  if (run.cancelRequested) throw new ComfyTaskCancelled()
}

const cancelPrompt = async (baseUrl: string, promptId: string) => {
  const response = await request(
    `${baseUrl}/api/jobs/${encodeURIComponent(promptId)}/cancel`,
    { method: 'POST' },
  )
  if (!response.ok) {
    throw new Error(`取消 ComfyUI 任务失败：HTTP ${response.status}`)
  }
  const result = await responseJson(response, '取消 ComfyUI 任务')
  if (typeof result?.cancelled !== 'boolean') {
    throw new Error('取消 ComfyUI 任务返回无效结果')
  }
}

const cancelRun = (run: ComfyTaskRun): Promise<void> => {
  if (run.cancelPromise) return run.cancelPromise
  run.cancelRequested = true
  run.cancelPromise = (async () => {
    try {
      // 提交请求已发出时，等它结束后再按已知 prompt_id 取消。
      // 即使响应丢失，也可用提交前指定的 ID 查询并取消。
      if (run.submission) {
        await run.submission.catch(() => {})
        await cancelPrompt(run.baseUrl, run.promptId)
      }
      run.controller.abort()
    } catch (error) {
      run.cancelRequested = false
      run.cancelPromise = undefined
      throw error
    }
  })()
  return run.cancelPromise
}

/** 删除进行中的 ComfyUI 任务前，先取消对应的远端工作流。 */
export async function cancelComfyTaskForDeletion(task: Task): Promise<void> {
  if (
    task.source !== COMFY_IMAGE_SOURCE ||
    (task.status !== 'pending' && task.status !== 'running')
  ) {
    return
  }
  const run = activeRuns.get(task.id)
  if (run) {
    await cancelRun(run)
    return
  }
  if (!task.comfyPromptId) {
    throw new Error('ComfyUI 任务缺少 prompt_id，无法安全取消')
  }
  const baseUrl = task.comfyBaseUrl
    ? normalizeComfyBaseUrl(task.comfyBaseUrl)
    : normalizeComfyBaseUrl(
        (await getComfyEndpoint(task.comfyEndpointId)).baseUrl,
      )
  await cancelPrompt(baseUrl, task.comfyPromptId)
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

const waitHistory = async (run: ComfyTaskRun) => {
  // ComfyUI 可能长时间排队，持续等待工作流完成或明确失败。
  while (true) {
    await waitForCancellation(run)
    const response = await request(
      `${run.baseUrl}/history/${encodeURIComponent(run.promptId)}`,
      { signal: run.controller.signal },
    )
    const data = await responseJson(response, '查询历史')
    await waitForCancellation(run)
    const item = data?.[run.promptId]
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
    await sleep(2000, undefined, { signal: run.controller.signal })
  }
}

async function runComfyTask(
  taskId: string,
  snapshot: TaskInputSnapshot,
  inputPath: string,
  workflow: Workflow,
  ids: WorkflowMarkerIds,
  run: ComfyTaskRun,
) {
  const saved: string[] = []
  const start = Date.now()
  let completed = false
  try {
    if (!(await taskService.updateActiveTask(taskId, { status: 'running' })))
      return
    await waitForCancellation(run)
    const baseUrl = run.baseUrl
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
        signal: run.controller.signal,
      }),
      '参考图上传',
    )
    await waitForCancellation(run)
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
    await waitForCancellation(run)
    run.submission = (async () =>
      responseJson(
        await request(`${baseUrl}/prompt`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            prompt: copy,
            client_id: randomUUID(),
            prompt_id: run.promptId,
          }),
        }),
        '工作流提交',
      ))()
    const submitted = await run.submission
    if (typeof submitted?.prompt_id !== 'string' || !submitted.prompt_id)
      throw new Error('ComfyUI 未返回 prompt_id')
    if (submitted.prompt_id !== run.promptId)
      throw new Error('ComfyUI 返回的 prompt_id 与提交时指定的不一致')
    await waitForCancellation(run)
    if (
      !(await taskService.updateActiveTask(taskId, {
        comfyPromptId: submitted.prompt_id,
      }))
    )
      return
    const history = await waitHistory(run)
    await waitForCancellation(run)
    const images = history?.outputs?.[ids['LinAI@output']]?.images
    if (!Array.isArray(images) || !images.length)
      throw new Error('LinAI@output 节点没有输出图片，请检查工作流最终保存节点')
    for (const item of images) {
      await waitForCancellation(run)
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
      const response = await request(view.href, {
        signal: run.controller.signal,
      })
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
    await waitForCancellation(run)
    const savedTask = await taskService.updateActiveTask(taskId, {
      status: 'completed',
      duration: Date.now() - start,
      outputUrls: saved.map((file) => `${GENERATED_IMAGES_API_PATH}/${file}`),
    })
    if (savedTask) {
      completed = true
      return
    }
  } catch (error) {
    if (run.cancelRequested) await run.cancelPromise?.catch(() => {})
    if (!run.cancelRequested) {
      const reason = error instanceof Error ? error.message : String(error)
      await taskService
        .updateActiveTask(taskId, { status: 'failed', error: reason })
        .catch(console.error)
    }
  } finally {
    activeRuns.delete(taskId)
    if (!completed) {
      await Promise.all(
        saved.map((file) =>
          fs.remove(path.join(GENERATED_IMAGES_DIR, file)).catch(console.error),
        ),
      )
    }
  }
}

export async function submitComfyTask(
  snapshot: TaskInputSnapshot,
  endpointId?: string | null,
) {
  if (!snapshot.prompt.trim()) throw new Error('请填写提示词')
  const inputPath = await checkedInputPath(snapshot.images)
  const endpoint = await getComfyEndpoint(endpointId)
  const { workflow, ids } = await loadComfyWorkflow(endpoint.workflowId)
  const baseUrl = normalizeComfyBaseUrl(endpoint.baseUrl)
  const taskId = randomUUID()
  const task = await taskService.createTaskFromSnapshot({
    id: taskId,
    snapshot,
    source: COMFY_IMAGE_SOURCE,
    metadata: {
      comfyEndpointId: endpoint.id,
      comfyWorkflowId: endpoint.workflowId,
      comfyBaseUrl: baseUrl,
      comfyPromptId: taskId,
    },
  })
  const run: ComfyTaskRun = {
    baseUrl,
    promptId: task.id,
    controller: new AbortController(),
    cancelRequested: false,
  }
  activeRuns.set(task.id, run)
  void runComfyTask(task.id, snapshot, inputPath, workflow, ids, run)
  return task.id
}
