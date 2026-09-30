import { useLocalSetting } from '@/client/hooks/useLocalSetting'
import type { Task } from '@/server/common/task'
import type { GptImageSize } from '@/shared/image/params'
import { message } from 'antd'
import {
  generateImage,
  retryImageTask,
  trialImage,
  type ImageGenerationInput,
} from '../service/generation'
import { openGPTImageSettingModal } from '../SettingModal'
import { useGptImageStore } from '../store'

type GenerationMode = 'generate' | 'trial'

/** 生成交互：配置缺失时继续设置，提交时校验参考图，统一展示结果。 */
export function useImageGeneration() {
  const { gptImageSettings, appendAspectRatio } = useLocalSetting()

  const submit = async (
    mode: GenerationMode,
    input: ImageGenerationInput,
    size: GptImageSize,
  ) => {
    // 设置弹窗可能改变接入点类型，继续生成时读取最新状态。
    const isComfy =
      useGptImageStore.getState().gptImageEndpointKind === 'comfyui'
    if (isComfy && (input.images || []).length !== 1) {
      message.warning(
        mode === 'trial'
          ? 'ComfyUI 试生成必须恰好提供一张参考图'
          : 'ComfyUI 生成必须恰好提供一张参考图',
      )
      return
    }
    try {
      const send = mode === 'trial' ? trialImage : generateImage
      await send(input, {
        isComfy,
        size,
        quality: gptImageSettings.quality,
        appendAspectRatio,
      })
      message.success('任务提交成功')
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
    const { gptImageEndpointKind, gptImageApiKey } = useGptImageStore.getState()
    if (gptImageEndpointKind !== 'comfyui' && !gptImageApiKey) {
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
