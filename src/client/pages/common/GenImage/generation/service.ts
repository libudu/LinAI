import { rpcResult } from '@/client/service/http'
import type { AppType } from '@/server'
import type { Task } from '@/server/common/task'
import { COMFY_IMAGE_SOURCE } from '@/shared/image/sources'
import { hc, type InferRequestType } from 'hono/client'

const client = hc<AppType>('/')
type GenerateRequest = InferRequestType<
  typeof client.api.gptImage.generate.$post
>['json']

export type ImageGenerationInput = GenerateRequest['input']
type GenerationOptions = Omit<GenerateRequest, 'input'> & { isComfy: boolean }

// 三个生成入口共用参数转换；ComfyUI 不发送云端比例、张数、尺寸和画质。
function createGenerationRequest(
  input: ImageGenerationInput,
  options: GenerationOptions,
): GenerateRequest {
  const { isComfy, mode, endpointId, size, quality, appendAspectRatio } =
    options
  return {
    mode: mode ?? 'generate',
    input: {
      title: input.title,
      prompt: input.prompt,
      images: input.images || [],
      aspectRatio: isComfy ? undefined : input.aspectRatio,
      n: isComfy ? undefined : input.n,
    },
    endpointId,
    size: isComfy ? undefined : size,
    quality: isComfy ? undefined : quality,
    appendAspectRatio: isComfy ? undefined : appendAspectRatio,
  }
}

export async function generateImage(
  input: ImageGenerationInput,
  options: GenerationOptions,
) {
  return rpcResult(
    client.api.gptImage.generate.$post({
      json: createGenerationRequest(input, options),
    }),
  )
}

export async function trialImage(
  input: ImageGenerationInput,
  options: GenerationOptions,
) {
  return generateImage(input, { ...options, mode: 'trial' })
}

export async function retryImageTask(task: Task) {
  const isComfy = task.source === COMFY_IMAGE_SOURCE
  if (
    isComfy &&
    (typeof task.comfyEndpointId !== 'string' || !task.comfyEndpointId)
  ) {
    throw new Error('原 ComfyUI 接入点信息缺失，无法重试')
  }
  const snapshot = task.inputSnapshot
  // 重试只读取历史快照；云端快照已包含当时的比例拼接，不再重复追加。
  return generateImage(
    {
      title: snapshot?.title,
      prompt: snapshot?.prompt || '',
      images: snapshot?.images || [],
      aspectRatio: snapshot?.aspectRatio,
      n: snapshot?.n,
    },
    {
      isComfy,
      mode: task.mode,
      endpointId: isComfy ? task.comfyEndpointId : undefined,
      size: task.size || '2k',
      quality: task.quality || 'medium',
    },
  )
}
