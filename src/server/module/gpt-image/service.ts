import {
  resolveImageEndpoint,
  validateImageEndpointInput,
} from '@/shared/gpt-image/endpoints'
import type { GptImageQuality, GptImageSize } from '@/shared/image/params'
import type { TaskInputSnapshot, TemplateValue } from '@/shared/image/template'
import { randomUUID } from 'crypto'
import { withImageLifecycle } from '../../common/static/image-lifecycle'
import { StorageError } from '../../common/storage/errors'
import { submitComfyTask } from './comfyui'
import { submitCloudTask } from './index'
import { getGptImageSettings, resolveGptImageConnection } from './settings'

function withAspectRatioLine(
  snapshot: TaskInputSnapshot,
  appendAspectRatio?: boolean,
): TaskInputSnapshot {
  if (!appendAspectRatio || !snapshot.aspectRatio) return snapshot
  return {
    ...snapshot,
    prompt: `${snapshot.prompt}\n图片比例${snapshot.aspectRatio.replace(':', '：')}`,
  }
}

/** 公共提交入口：固定设置快照、校验能力并登记任务，两个协议都立即返回任务 ID。 */
export async function submitImageGeneration(options: {
  input: Omit<TemplateValue, 'folder'>
  size?: GptImageSize
  quality?: GptImageQuality
  appendAspectRatio?: boolean
  endpointId?: string
}) {
  try {
    const { input, size, quality, appendAspectRatio, endpointId } = options
    const settings = await getGptImageSettings()
    const endpoint = resolveImageEndpoint(
      settings,
      endpointId ?? settings.gptImageEndpointId,
    )
    if (!endpoint) throw new Error('生图接入点已删除或未配置')
    const validation = validateImageEndpointInput(endpoint, {
      ...input,
      size,
      quality,
    })
    if (validation) throw new Error(validation)
    const snapshot: TaskInputSnapshot = {
      ...input,
      id: randomUUID(),
      createdAt: Date.now(),
    }
    const taskId = await withImageLifecycle(async () => {
      if (endpoint.protocol === 'comfyui')
        return submitComfyTask(
          {
            id: snapshot.id,
            createdAt: snapshot.createdAt,
            title: snapshot.title,
            prompt: snapshot.prompt,
            images: snapshot.images,
          },
          endpoint,
        )
      const connection = resolveGptImageConnection({
        ...settings,
        gptImageEndpointId: endpoint.selectionId,
      })
      if (!connection.apiKey)
        throw new Error('[配置] API Key is not configured')
      return submitCloudTask({
        ...connection,
        snapshot: withAspectRatioLine(snapshot, appendAspectRatio),
        size,
        quality,
      })
    })
    return {
      status: 200 as const,
      data: { success: true as const, taskId, outputUrls: [] as string[] },
    }
  } catch (error) {
    if (error instanceof StorageError) throw error
    return {
      status: 400 as const,
      data: {
        success: false as const,
        error: error instanceof Error ? error.message : String(error),
      },
    }
  }
}
