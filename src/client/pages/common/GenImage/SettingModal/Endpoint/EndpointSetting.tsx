import { isVeniceEndpoint } from '@/server/module/gpt-image/enum'
import { normalizeComfyBaseUrl } from '@/shared/gpt-image/comfyui'
import { CloseOutlined } from '@ant-design/icons'
import { Form, Input, Select } from 'antd'
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { useGptImageStore } from '../../store'
import {
  ENDPOINT_PRESETS,
  NEW_COMFY_VALUE,
  NEW_CUSTOM_VALUE,
  comfyValue,
  customValue,
  findPresetEndpoint,
  isComfyValue,
  presetValue,
  resolvePresetApiKey,
} from './endpointPresets'
import { useEndpointActions } from './useEndpointActions'

export interface EndpointSettingRef {
  save: () => Promise<string | undefined>
}

export const EndpointSetting = forwardRef<EndpointSettingRef>((_props, ref) => {
  const [form] = Form.useForm()
  const [workflowFile, setWorkflowFile] = useState<File | null>(null)
  const {
    gptImageApiKey,
    gptImageBaseUrl,
    gptImageModelId,
    gptImageCustomEndpoints,
    gptImagePresetApiKeys,
    gptImageEndpointKind,
    gptImageEndpointId,
    gptImageComfyEndpoints,
  } = useGptImageStore()
  const { save, deleteCustom, deleteComfy } = useEndpointActions()

  const endpoint = Form.useWatch('endpoint', form)
  const baseUrlValue = Form.useWatch('baseUrl', form)
  const isNewCustom = endpoint === NEW_CUSTOM_VALUE
  const isNewComfy = endpoint === NEW_COMFY_VALUE
  const selectedPreset = ENDPOINT_PRESETS.find(
    (p) => presetValue(p.label) === endpoint,
  )
  const selectedCustom = gptImageCustomEndpoints.find(
    (c) => customValue(c.id) === endpoint,
  )
  const selectedComfy = gptImageComfyEndpoints.find(
    (c) => comfyValue(c.id) === endpoint,
  )
  const isComfyForm = isComfyValue(endpoint || '')

  useEffect(() => {
    if (gptImageEndpointKind === 'comfyui') {
      const comfy = gptImageComfyEndpoints.find(
        (item) => item.id === gptImageEndpointId,
      )
      if (comfy) {
        form.setFieldsValue({
          endpoint: comfyValue(comfy.id),
          title: comfy.title,
          baseUrl: comfy.baseUrl,
          workflowName: comfy.workflowName,
          apiKey: '',
          modelId: '',
        })
        return
      }
    }
    // 根据已保存的 baseUrl/modelId 反推下拉选中项：优先匹配预设（支持 legacyModelIds 自动兼容），
    // 其次已保存的自定义接入点（必须有标题），否则回退到默认预设
    const matchedPreset = gptImageEndpointId?.startsWith('custom:')
      ? undefined
      : (ENDPOINT_PRESETS.find(
          (item) => `preset:${item.label}` === gptImageEndpointId,
        ) ?? findPresetEndpoint(gptImageBaseUrl, gptImageModelId))
    const matchedCustom = gptImageCustomEndpoints.find(
      (c) =>
        (gptImageEndpointId === `custom:${c.id}` ||
          (c.baseUrl === gptImageBaseUrl && c.modelId === gptImageModelId)) &&
        Boolean(c.title?.trim()),
    )

    if (matchedPreset) {
      form.setFieldsValue({
        apiKey:
          resolvePresetApiKey(matchedPreset, gptImagePresetApiKeys) ||
          gptImageApiKey ||
          '',
        endpoint: presetValue(matchedPreset.label),
        title: '',
        baseUrl: matchedPreset.baseUrl,
        modelId: matchedPreset.modelId,
      })
    } else if (matchedCustom) {
      form.setFieldsValue({
        apiKey: matchedCustom.apiKey ?? gptImageApiKey ?? '',
        endpoint: customValue(matchedCustom.id),
        title: matchedCustom.title,
        baseUrl: matchedCustom.baseUrl,
        modelId: matchedCustom.modelId,
      })
    } else {
      // 既不是预设也不是有标题的自定义接入点：回退到第一个预设
      const defaultPreset = ENDPOINT_PRESETS[0]
      form.setFieldsValue({
        apiKey:
          resolvePresetApiKey(defaultPreset, gptImagePresetApiKeys) ||
          gptImageApiKey ||
          '',
        endpoint: presetValue(defaultPreset.label),
        title: '',
        baseUrl: defaultPreset.baseUrl,
        modelId: defaultPreset.modelId,
      })
    }
  }, [
    gptImageApiKey,
    gptImageBaseUrl,
    gptImageModelId,
    gptImageCustomEndpoints,
    gptImagePresetApiKeys,
    gptImageEndpointKind,
    gptImageEndpointId,
    gptImageComfyEndpoints,
    form,
  ])

  // 切换下拉选项时，同步填充/清空接入点信息与对应的 API Key
  const handleEndpointChange = (value: string) => {
    setWorkflowFile(null)
    if (value === NEW_COMFY_VALUE) {
      form.setFieldsValue({
        title: '',
        baseUrl: 'http://127.0.0.1:8188',
        workflowName: '',
        modelId: '',
        apiKey: '',
      })
      return
    }
    const comfy = gptImageComfyEndpoints.find(
      (item) => comfyValue(item.id) === value,
    )
    if (comfy) {
      form.setFieldsValue({
        title: comfy.title,
        baseUrl: comfy.baseUrl,
        workflowName: comfy.workflowName,
        modelId: '',
        apiKey: '',
      })
      return
    }
    if (value === NEW_CUSTOM_VALUE) {
      form.setFieldsValue({
        title: '',
        baseUrl: '',
        modelId: '',
        apiKey: '',
      })
      return
    }
    const preset = ENDPOINT_PRESETS.find((p) => presetValue(p.label) === value)
    if (preset) {
      form.setFieldsValue({
        title: '',
        baseUrl: preset.baseUrl,
        modelId: preset.modelId,
        apiKey: resolvePresetApiKey(preset, gptImagePresetApiKeys) || '',
      })
      return
    }
    const custom = gptImageCustomEndpoints.find(
      (c) => customValue(c.id) === value,
    )
    if (custom) {
      form.setFieldsValue({
        title: custom.title,
        baseUrl: custom.baseUrl,
        modelId: custom.modelId,
        apiKey: custom.apiKey ?? '',
      })
    }
  }

  useImperativeHandle(ref, () => ({
    save: async () => {
      const result = await save(await form.validateFields(), workflowFile)
      setWorkflowFile(null)
      return result
    },
  }))
  return (
    <div className="px-4 py-2">
      {/* 中转站风险提示：自定义实现，样式与间距独立控制，不依赖 antd Alert */}
      <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5">
        <div className="min-w-0">
          <div className="text-sm font-medium text-amber-800">
            警惕中转站风险
          </div>
          <div className="mt-1 text-xs leading-5 text-amber-700">
            第三方中转站可能存在跑路或诈骗风险：请勿填写真实密码等敏感信息；充值前请多方核实平台口碑与运营方是否可靠；切勿一次性大额充值，建议小额试用、随用随充。
          </div>
        </div>
      </div>
      <Form form={form} layout="vertical">
        <Form.Item
          name="endpoint"
          label="接入点"
          rules={[{ required: true, message: '请选择接入点' }]}
          extra={selectedPreset?.remark}
        >
          <Select
            onChange={handleEndpointChange}
            // 选中结果只展示纯文本标题；删除按钮仅通过 optionRender 渲染在下拉选项中
            optionRender={(option) => {
              const value = String(option.value)
              if (!value.startsWith('custom:') && !value.startsWith('comfy:'))
                return option.label
              const id = value.split(':')[1]
              return (
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{option.label}</span>
                  <CloseOutlined
                    className="rounded p-0.5 text-gray-400 hover:bg-gray-500/20 hover:text-red-500"
                    title="删除该接入点"
                    onMouseDown={(e) => {
                      // 阻止触发选项选中与下拉收起
                      e.preventDefault()
                      e.stopPropagation()
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      const deletion = value.startsWith('comfy:')
                        ? deleteComfy(id)
                        : deleteCustom(id)
                      void deletion.catch(() => undefined)
                    }}
                  />
                </div>
              )
            }}
            options={[
              ...ENDPOINT_PRESETS.map((p) => ({
                label: p.label,
                value: presetValue(p.label),
              })),
              ...gptImageCustomEndpoints
                .filter((c) => Boolean(c.title?.trim()))
                .map((c) => ({
                  label: c.title,
                  value: customValue(c.id),
                })),
              ...gptImageComfyEndpoints.map((c) => ({
                label: `${c.title} · ComfyUI`,
                value: comfyValue(c.id),
              })),
              { label: '新增自定义接入点', value: NEW_CUSTOM_VALUE },
              { label: '新增本地 ComfyUI 工作流', value: NEW_COMFY_VALUE },
            ]}
          />
        </Form.Item>
        {(isNewCustom || selectedCustom || isComfyForm) && (
          <>
            <Form.Item
              name="title"
              label="标题"
              rules={[{ required: true, message: '请输入标题' }]}
            >
              <Input placeholder="用于在接入点选项中展示的名称" />
            </Form.Item>
            <Form.Item
              name="baseUrl"
              label="Base URL"
              rules={[
                { required: true, message: '请输入 Base URL' },
                ...(isComfyForm
                  ? [
                      {
                        validator: (_: unknown, value: string) => {
                          try {
                            normalizeComfyBaseUrl(value)
                            return Promise.resolve()
                          } catch (error) {
                            return Promise.reject(error)
                          }
                        },
                      },
                    ]
                  : [{ type: 'url' as const, message: '请输入合法的 URL' }]),
              ]}
              extra={
                isComfyForm
                  ? '仅支持本机 http://127.0.0.1、localhost 或 [::1] 地址'
                  : isVeniceEndpoint(baseUrlValue)
                    ? '已识别为 Venice 特殊适配接入点：带参考图时将自动使用 image/multi-edit 接口'
                    : undefined
              }
            >
              <Input placeholder="例如 https://api.example.com/v1" />
            </Form.Item>
            {!isComfyForm && (
              <Form.Item
                name="modelId"
                label="模型 ID"
                rules={[{ required: true, message: '请输入模型 ID' }]}
              >
                <Input placeholder="例如 gpt-image-2" />
              </Form.Item>
            )}
          </>
        )}
        {isComfyForm && (
          <Form.Item
            label="API 格式工作流 JSON"
            required={isNewComfy}
            extra={
              selectedComfy
                ? `当前：${selectedComfy.workflowName}；选择新文件可更新工作流`
                : '在 ComfyUI 中导出 API 格式 JSON，并为三个节点设置 LinAI@ 标题'
            }
          >
            <Input
              key={endpoint}
              type="file"
              accept=".json,application/json"
              onChange={(event) =>
                setWorkflowFile(event.target.files?.[0] ?? null)
              }
            />
          </Form.Item>
        )}
        {!isComfyForm && (
          <Form.Item
            name="apiKey"
            label="API Key"
            rules={[{ required: true, message: '请输入 API Key' }]}
          >
            <Input.Password placeholder="输入 API Key" />
          </Form.Item>
        )}
      </Form>
    </div>
  )
})
