import { useLocalSetting } from '@/client/hooks/useLocalSetting'
import type { Task } from '@/server/common/task'
import {
  getImageEndpointCapabilities,
  validateImageEndpointInput,
} from '@/shared/gpt-image/endpoints'
import type { GptImageSize } from '@/shared/image/params'
import { message } from 'antd'
import { openGPTImageSettingModal } from '../settings'
import { useGptImageStore } from '../settings/store'
import { refreshTasks } from '../tasks/useTasks'
import {
  generateImage,
  retryImageTask,
  trialImage,
  type ImageGenerationInput,
} from './service'

type GenerationMode = 'generate' | 'trial'

/** 生成交互：配置缺失时继续设置，提交时校验参考图，统一展示结果。 */
export function useImageGeneration() {
  const { gptImageSettings, appendAspectRatio } = useLocalSetting()

  const submit = async (
    mode: GenerationMode,
    input: ImageGenerationInput,
    size: GptImageSize,
  ) => {
    try {
      if (!useGptImageStore.getState().loaded)
        await useGptImageStore.getState().fetchConfig()
      const endpoint = useGptImageStore.getState().currentEndpoint
      if (!endpoint) throw new Error('生图接入点未配置')
      const capabilities = getImageEndpointCapabilities(
        endpoint,
        input.images?.length,
      )
      const isComfy = endpoint.protocol === 'comfyui'
      const quality = capabilities.qualities.includes(gptImageSettings.quality)
        ? gptImageSettings.quality
        : capabilities.qualities[0]
      const validation = validateImageEndpointInput(endpoint, {
        ...input,
        size,
        quality,
      })
      if (validation) throw new Error(validation)
      const send = mode === 'trial' ? trialImage : generateImage
      await send(input, {
        isComfy,
        size,
        quality,
        appendAspectRatio,
        endpointId: endpoint.selectionId,
      })
      message.success('任务提交成功')
      refreshTasks()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '生成请求失败')
    }
  }

  const submitWithConfig = (
    mode: GenerationMode,
    input: ImageGenerationInput,
    size: GptImageSize,
  ) => {
    if (!input.prompt) {
      message.warning('请先填写提示词')
      return
    }
    const { currentEndpoint, loaded, gptImageApiKey } =
      useGptImageStore.getState()
    if (loaded && currentEndpoint?.protocol !== 'comfyui' && !gptImageApiKey) {
      openGPTImageSettingModal({
        initialTab: 'endpoint',
        initialOnly: true,
        onSuccess: () => {
          void submit(mode, input, size)
        },
      })
      return
    }
    void submit(mode, input, size)
  }

  const retry = async (task: Task) => {
    try {
      await retryImageTask(task)
      message.success('已创建重试任务')
      refreshTasks()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '重试请求失败')
    }
  }

  return {
    generate: (input: ImageGenerationInput, size: GptImageSize) =>
      submitWithConfig('generate', input, size),
    trial: (input: ImageGenerationInput, size: GptImageSize) =>
      submitWithConfig('trial', input, size),
    retry,
  }
}
