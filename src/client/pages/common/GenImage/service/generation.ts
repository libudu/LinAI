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
type GenerationResponse =
  | Awaited<ReturnType<typeof client.api.gptImage.generate.$post>>
  | Awaited<ReturnType<typeof client.api.gptImage.trial.$post>>

// 三个生成入口共用参数转换；ComfyUI 不发送云端比例、张数、尺寸和画质。
function createGenerationRequest(
  input: ImageGenerationInput,
  options: GenerationOptions,
): GenerateRequest {
  const { isComfy, endpointId, size, quality, appendAspectRatio } = options
  return {
    input: {
      title: input.title,
      prompt: input.prompt,
      images: input.images || [],
      aspectRatio: isComfy ? undefined : input.aspectRatio,
      n: isComfy ? undefined : input.n,
    },
    endpointId: isComfy ? endpointId : undefined,
    size: isComfy ? undefined : size,
    quality: isComfy ? undefined : quality,
    appendAspectRatio: isComfy ? undefined : appendAspectRatio,
  }
}

async function readGenerationResponse(response: GenerationResponse) {
  const data = await response.json()
  if (!response.ok || !data.success) {
    // 全局 onError 的存储错误为对象，业务错误为字符串，两种都保留原始信息。
    const error: unknown = 'error' in data ? data.error : undefined
    if (typeof error === 'string' && error) throw new Error(error)
    if (
      error &&
      typeof error === 'object' &&
      'message' in error &&
      typeof error.message === 'string' &&
      error.message
    ) {
      throw new Error(error.message)
    }
    throw new Error(`生成请求失败（HTTP ${response.status}）`)
  }
  return data
}

export async function generateImage(
  input: ImageGenerationInput,
  options: GenerationOptions,
) {
  const response = await client.api.gptImage.generate.$post({
    json: createGenerationRequest(input, options),
  })
  return readGenerationResponse(response)
}

export async function trialImage(
  input: ImageGenerationInput,
  options: GenerationOptions,
) {
  const request = createGenerationRequest(input, options)
  const response = await client.api.gptImage.trial.$post({
    json: {
      prompt: request.input.prompt,
      images: request.input.images,
      aspectRatio: request.input.aspectRatio,
      n: request.input.n,
      size: request.size,
      quality: request.quality,
      appendAspectRatio: request.appendAspectRatio,
    },
  })
  return readGenerationResponse(response)
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
      endpointId: isComfy ? task.comfyEndpointId : undefined,
      size: task.size || '2k',
      quality: task.quality || 'medium',
    },
  )
}
