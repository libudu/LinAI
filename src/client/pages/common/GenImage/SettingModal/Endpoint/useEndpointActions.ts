import { message } from 'antd'
import { useGptImageStore } from '../../store'
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
  baseUrl: string
  modelId: string
  apiKey: string
}

const generateId = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

const defaultSelection = () => {
  const preset = ENDPOINT_PRESETS[0]
  return {
    gptImageBaseUrl: preset.baseUrl,
    gptImageModelId: preset.modelId,
    gptImageEndpointKind: 'openai' as const,
    gptImageEndpointId: presetValue(preset.label),
  }
}

export function useEndpointActions() {
  const {
    gptImageBaseUrl,
    gptImageModelId,
    gptImageCustomEndpoints,
    gptImagePresetApiKeys,
    gptImageEndpointKind,
    gptImageEndpointId,
    gptImageComfyEndpoints,
    saveConfig,
    fetchConfig,
  } = useGptImageStore()

  const deleteCustom = async (id: string) => {
    const target = gptImageCustomEndpoints.find((item) => item.id === id)
    if (!target) return
    const isCurrent =
      gptImageEndpointKind === 'openai' &&
      (gptImageEndpointId === customValue(id) ||
        (!gptImageEndpointId &&
          target.baseUrl === gptImageBaseUrl &&
          target.modelId === gptImageModelId))
    await saveConfig({
      gptImageCustomEndpoints: gptImageCustomEndpoints.filter(
        (item) => item.id !== id,
      ),
      ...(isCurrent ? defaultSelection() : {}),
    })
    message.success('已删除自定义接入点')
  }

  const deleteComfy = async (id: string) => {
    const isCurrent =
      gptImageEndpointKind === 'comfyui' && gptImageEndpointId === id
    await saveConfig({
      gptImageComfyEndpoints: gptImageComfyEndpoints.filter(
        (item) => item.id !== id,
      ),
      ...(isCurrent ? defaultSelection() : {}),
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
      if (!result.success) {
        message.error(result.error || '工作流导入失败')
        throw new Error(result.error || '工作流导入失败')
      }
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
        gptImageEndpointKind: 'comfyui',
        gptImageEndpointId: current.id,
      })
    }
    message.success('ComfyUI 接入点已保存')
    return 'comfyui'
  }

  const saveOpenAi = async (values: EndpointFormValues) => {
    if (!values.apiKey) {
      message.warning('请输入 API Key')
      throw new Error('No API Key')
    }

    let baseUrl: string
    let modelId: string
    let selectedId: string
    let nextCustomEndpoints = gptImageCustomEndpoints
    let nextPresetApiKeys = gptImagePresetApiKeys
    const apiKey = values.apiKey
    if (values.endpoint === NEW_CUSTOM_VALUE) {
      baseUrl = values.baseUrl.trim()
      modelId = values.modelId.trim()
      const title = values.title.trim()
      const existingIndex = gptImageCustomEndpoints.findIndex(
        (item) => item.baseUrl === baseUrl && item.modelId === modelId,
      )
      const id =
        existingIndex >= 0
          ? gptImageCustomEndpoints[existingIndex].id
          : generateId()
      selectedId = customValue(id)
      nextCustomEndpoints =
        existingIndex >= 0
          ? gptImageCustomEndpoints.map((item, index) =>
              index === existingIndex ? { ...item, title, apiKey } : item,
            )
          : [
              ...gptImageCustomEndpoints.filter((item) =>
                Boolean(item.title?.trim()),
              ),
              { id, title, baseUrl, modelId, apiKey },
            ]
    } else if (values.endpoint.startsWith('custom:')) {
      const custom = gptImageCustomEndpoints.find(
        (item) => customValue(item.id) === values.endpoint,
      )
      if (!custom) throw new Error('自定义接入点已删除')
      selectedId = customValue(custom.id)
      baseUrl = values.baseUrl.trim()
      modelId = values.modelId.trim()
      const title = values.title.trim()
      nextCustomEndpoints = gptImageCustomEndpoints
        .filter((item) => item.id === custom.id || Boolean(item.title?.trim()))
        .map((item) =>
          item.id === custom.id
            ? { ...item, title, baseUrl, modelId, apiKey }
            : item,
        )
    } else {
      const preset = ENDPOINT_PRESETS.find(
        (item) => presetValue(item.label) === values.endpoint,
      )
      if (!preset) throw new Error('接入点不存在')
      selectedId = presetValue(preset.label)
      baseUrl = preset.baseUrl
      modelId = preset.modelId
      nextPresetApiKeys = { ...gptImagePresetApiKeys, [preset.label]: apiKey }
    }

    await saveConfig({
      gptImageBaseUrl: baseUrl,
      gptImageModelId: modelId,
      gptImageEndpointKind: 'openai',
      gptImageEndpointId: selectedId,
      gptImageCustomEndpoints: nextCustomEndpoints,
      gptImagePresetApiKeys: nextPresetApiKeys,
    })
    message.success('配置保存成功')
    return apiKey
  }

  const save = (values: EndpointFormValues, workflowFile: File | null) =>
    isComfyValue(values.endpoint)
      ? saveComfy(values, workflowFile)
      : saveOpenAi(values)

  return { save, deleteCustom, deleteComfy }
}
