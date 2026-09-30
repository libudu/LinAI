import type { GptImageQuality, GptImageSize } from '@/shared/image/params'
import type { TaskInputSnapshot, TemplateValue } from '@/shared/image/template'
import { randomUUID } from 'crypto'
import { StorageError } from '../../common/storage/errors'
import { submitComfyTask } from './comfyui'
import { handleImageGeneration } from './index'
import {
  getGptImageSettings,
  resolveComfyEndpoint,
  resolveGptImageConnection,
} from './settings'

// 部分云端分组不支持比例参数，需要把比例追加到实际生成提示词中。
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

/** 试生成、模板生成和重试的公共入口；路由只负责输入校验与 HTTP 响应。 */
export async function submitImageGeneration(options: {
  input: Omit<TemplateValue, 'folder'>
  size?: GptImageSize
  quality?: GptImageQuality
  appendAspectRatio?: boolean
  /** 指定原 ComfyUI 接入点进行重试，不能回退到当前云端接入点。 */
  endpointId?: string
}) {
  const { input, size, quality, appendAspectRatio, endpointId } = options
  const settings = await getGptImageSettings()
  const snapshot: TaskInputSnapshot = {
    id: randomUUID(),
    createdAt: Date.now(),
    ...input,
  }

  if (endpointId || settings.gptImageEndpointKind === 'comfyui') {
    try {
      const endpoint = resolveComfyEndpoint(settings, endpointId)
      // ComfyUI 只消费提示词和参考图，不将云端参数记录到任务快照。
      const taskId = await submitComfyTask(
        {
          id: snapshot.id,
          createdAt: snapshot.createdAt,
          title: snapshot.title,
          prompt: snapshot.prompt,
          images: snapshot.images,
        },
        endpoint,
      )
      return {
        status: 200 as const,
        data: { success: true as const, taskId, outputUrls: [] as string[] },
      }
    } catch (error) {
      // 写盘失败、版本冲突等交给全局 onError，不能当成输入错误返回 400。
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

  const connection = resolveGptImageConnection(settings)
  if (!connection.apiKey) {
    return {
      status: 400 as const,
      data: {
        success: false as const,
        error: '[配置] API Key is not configured',
      },
    }
  }
  return handleImageGeneration({
    ...connection,
    snapshot: withAspectRatioLine(snapshot, appendAspectRatio),
    size,
    quality,
  })
}
