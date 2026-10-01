import type { CloudImageProtocol } from '@/shared/gpt-image/endpoints'
import type { GptImageQuality, GptImageSize } from '@/shared/image/params'
import { GPT_IMAGE_SOURCE_MODEL } from '@/shared/image/sources'
import type { TaskInputSnapshot } from '@/shared/image/template'
import fs from 'fs-extra'
import path from 'path'
import { logger } from '../../common/logger'
import { INPUT_IMAGES_DIR } from '../../common/static'
import { withImageLifecycle } from '../../common/static/image-lifecycle'
import { taskService } from '../../common/task'
import { calculateSize, generateGPTImage } from './generate'
import { imageFilename } from './image-references'
import { GeneratedImageBatch } from './output-files'

interface CloudTaskOptions {
  protocol: CloudImageProtocol
  apiKey: string
  baseUrl: string
  modelId: string
  snapshot: TaskInputSnapshot
  size?: GptImageSize
  quality?: GptImageQuality
}

interface CloudTaskRun {
  controller: AbortController
  done: Promise<void>
}
const activeRuns = new Map<string, CloudTaskRun>()

/** 取消本地等待并等文件收尾；云端是否停止计费由服务商决定。 */
export async function cancelCloudTaskForDeletion(id: string): Promise<void> {
  const run = activeRuns.get(id)
  if (!run) return
  run.controller.abort()
  await run.done
}

async function runCloudTask(
  taskId: string,
  options: CloudTaskOptions,
  imagePaths: string[],
  signal: AbortSignal,
) {
  const output = new GeneratedImageBatch()
  const startedAt = Date.now()
  try {
    if (!(await taskService.updateActiveTask(taskId, { status: 'running' })))
      return
    signal.throwIfAborted()
    const { snapshot, size = '1k', quality = 'medium' } = options
    const { usage } = await generateGPTImage({
      ...options,
      size: calculateSize(snapshot.aspectRatio || '1:1', size),
      quality,
      prompt: snapshot.prompt,
      imagePaths,
      n: snapshot.n || 1,
      resolution: size,
      aspectRatio: snapshot.aspectRatio || '1:1',
      signal,
      output,
    })
    signal.throwIfAborted()
    if (!output.urls.length) throw new Error('接入点未返回有效图片')
    await withImageLifecycle(async () => {
      signal.throwIfAborted()
      if (
        await taskService.updateActiveTask(taskId, {
          status: 'completed',
          duration: Date.now() - startedAt,
          outputUrls: output.urls,
          gptTokenUsage: usage,
        })
      )
        output.commit()
    })
  } catch (error) {
    const reason = signal.aborted
      ? '[服务] 本地生成任务已取消'
      : `[${new URL(options.baseUrl).host}] ${error instanceof Error ? error.message : String(error)}`
    await taskService
      .updateActiveTask(taskId, { status: 'failed', error: reason })
      .catch((failure) => logger.error('生成任务失败状态保存失败', failure))
    if (!signal.aborted) logger.error('云端生图任务失败', reason)
  } finally {
    await output
      .dispose()
      .catch((error) => logger.error('生成图片清理失败', error))
    activeRuns.delete(taskId)
  }
}

/** 输入校验、任务登记在提交阶段完成，执行不占用 HTTP 请求。 */
export async function submitCloudTask(options: CloudTaskOptions) {
  if (!options.snapshot.prompt.trim()) throw new Error('请填写提示词')
  let url: URL
  try {
    url = new URL(options.baseUrl)
  } catch {
    throw new Error('生图接入点 Base URL 无效，请修改设置')
  }
  if (!['http:', 'https:'].includes(url.protocol) || !options.modelId.trim())
    throw new Error('生图接入点地址或模型未配置，请修改设置')
  const imagePaths: string[] = []
  for (const url of options.snapshot.images) {
    const filename = imageFilename('input', url)
    if (!filename) throw new Error('参考图必须是 LinAI 已保存的输入图片')
    const file = path.join(INPUT_IMAGES_DIR, filename)
    if (!(await fs.pathExists(file)))
      throw new Error('参考图文件不存在，请重新上传')
    imagePaths.push(file)
  }
  const task = await taskService.createTaskFromSnapshot({
    snapshot: options.snapshot,
    source: GPT_IMAGE_SOURCE_MODEL,
    size: options.size ?? '1k',
    quality: options.quality ?? 'medium',
  })
  const controller = new AbortController()
  // 执行器的首次 await 会让出控制，删除前已登记本轮执行。
  const done = runCloudTask(task.id, options, imagePaths, controller.signal)
  activeRuns.set(task.id, { controller, done })
  return task.id
}
