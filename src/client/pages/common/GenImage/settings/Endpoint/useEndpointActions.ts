import type {
  CloudImageProtocol,
  QuotaProvider,
} from '@/shared/gpt-image/endpoints'
import { message } from 'antd'
import { useGptImageStore } from '../store'
import {
  ENDPOINT_PRESETS,
  NEW_CUSTOM_VALUE,
  comfyValue,
  customValue,
  isComfyValue,
  presetValue,
} from './endpointPresets'

export interface EndpointFormValues {
  endpoint: string
  title: string
  protocol: CloudImageProtocol
  quotaProvider: QuotaProvider
  baseUrl: string
  modelId: string
  apiKey: string
}

const defaultSelection = () => ({
  gptImageEndpointId: presetValue(ENDPOINT_PRESETS[0].id),
})

export function useEndpointActions() {
  const {
    gptImageCustomEndpoints,
    gptImagePresetApiKeys,
    gptImageEndpointId,
    gptImageComfyEndpoints,
    saveConfig,
    fetchConfig,
  } = useGptImageStore()

  const deleteCustom = async (id: string) => {
    await saveConfig({
      gptImageCustomEndpoints: gptImageCustomEndpoints.filter(
        (item) => item.id !== id,
      ),
      ...(gptImageEndpointId === customValue(id) ? defaultSelection() : {}),
    })
    message.success('已删除自定义接入点')
  }
  const deleteComfy = async (id: string) => {
    await saveConfig({
      gptImageComfyEndpoints: gptImageComfyEndpoints.filter(
        (item) => item.id !== id,
      ),
      ...(gptImageEndpointId === id ? defaultSelection() : {}),
    })
    message.success('已删除 ComfyUI 接入点')
  }
  const saveComfy = async (
    values: EndpointFormValues,
    workflowFile: File | null,
  ) => {
    const current = gptImageComfyEndpoints.find(
      (item) => comfyValue(item.id) === values.endpoint,
    )
    if (!current && !workflowFile) throw new Error('请选择 API 格式工作流 JSON')
    if (workflowFile) {
      const response = await fetch('/api/gptImage/comfyui/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          endpointId: current?.id,
          title: values.title.trim(),
          baseUrl: values.baseUrl.trim(),
          workflowName: workflowFile.name,
          content: await workflowFile.text(),
        }),
      })
      const result = await response.json()
      if (!response.ok || !result.success)
        throw new Error(
          (typeof result.error === 'string'
            ? result.error
            : result.error?.message) || '工作流导入失败',
        )
      await fetchConfig()
    } else if (current) {
      await saveConfig({
        gptImageComfyEndpoints: gptImageComfyEndpoints.map((item) =>
          item.id === current.id
            ? {
                ...item,
                title: values.title.trim(),
                baseUrl: values.baseUrl.trim(),
              }
            : item,
        ),
        gptImageEndpointId: current.id,
      })
    }
    message.success('ComfyUI 接入点已保存')
    return 'comfyui'
  }
  const saveOpenAi = async (values: EndpointFormValues) => {
    if (!values.apiKey) throw new Error('请输入 API Key')
    const preset = ENDPOINT_PRESETS.find(
      (item) => presetValue(item.id) === values.endpoint,
    )
    if (preset) {
      await saveConfig({
        gptImageEndpointId: presetValue(preset.id),
        gptImagePresetApiKeys: {
          ...gptImagePresetApiKeys,
          [preset.id]: values.apiKey,
        },
      })
    } else {
      const current = gptImageCustomEndpoints.find(
        (item) => customValue(item.id) === values.endpoint,
      )
      if (values.endpoint !== NEW_CUSTOM_VALUE && !current)
        throw new Error('自定义接入点已删除')
      const endpoint = {
        id: current?.id ?? crypto.randomUUID(),
        title: values.title.trim(),
        protocol: values.protocol,
        quotaProvider: values.quotaProvider ?? 'none',
        baseUrl: values.baseUrl.trim(),
        modelId: values.modelId.trim(),
        apiKey: values.apiKey,
      }
      await saveConfig({
        gptImageEndpointId: customValue(endpoint.id),
        gptImageCustomEndpoints: current
          ? gptImageCustomEndpoints.map((item) =>
              item.id === current.id ? endpoint : item,
            )
          : [...gptImageCustomEndpoints, endpoint],
      })
    }
    message.success('配置保存成功')
    return values.apiKey
  }
  const save = (values: EndpointFormValues, workflowFile: File | null) =>
    isComfyValue(values.endpoint)
      ? saveComfy(values, workflowFile)
      : saveOpenAi(values)
  return { save, deleteCustom, deleteComfy }
}
