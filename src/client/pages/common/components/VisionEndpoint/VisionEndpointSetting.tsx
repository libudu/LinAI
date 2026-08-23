import type { VisionCustomEndpoint } from '@/shared/vision/endpoints'
import { CloseOutlined } from '@ant-design/icons'
import { Form, Input, message, Select } from 'antd'
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  type ReactNode,
} from 'react'
import { VISION_ENDPOINT_PRESETS } from './presets'

const NEW_CUSTOM_VALUE = '__new_custom__'
const presetValue = (label: string) => `preset:${label}`
const customValue = (id: string) => `custom:${id}`
const generateId = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

export interface VisionEndpointSettingRef {
  save: () => Promise<string | undefined>
}

/**
 * 视觉接入点设置通用表单（预设 + 自定义接入点 + keychain）。
 * 数据与保存动作全部由 props 注入，各模块绑定自己的配置 store，
 * 因此不同模块（图片生成 / Eagle 等）的配置互相独立。
 */
export interface VisionEndpointSettingProps {
  apiKey: string | null
  baseUrl: string
  modelId: string
  customEndpoints: VisionCustomEndpoint[]
  presetApiKeys: Record<string, string>
  setEndpoint: (baseUrl: string, modelId: string) => Promise<void>
  setCustomEndpoints: (endpoints: VisionCustomEndpoint[]) => Promise<void>
  setPresetApiKeys: (keys: Record<string, string>) => Promise<void>
  /** 顶部提示标题与内容（各模块自定义） */
  noticeTitle: string
  notice: ReactNode
}

export const VisionEndpointSetting = forwardRef<
  VisionEndpointSettingRef,
  VisionEndpointSettingProps
>((props, ref) => {
  const {
    apiKey,
    baseUrl,
    modelId,
    customEndpoints,
    presetApiKeys,
    setEndpoint,
    setCustomEndpoints,
    setPresetApiKeys,
    noticeTitle,
    notice,
  } = props
  const [form] = Form.useForm()

  const endpoint = Form.useWatch('endpoint', form)
  const isNewCustom = endpoint === NEW_CUSTOM_VALUE
  const selectedPreset = VISION_ENDPOINT_PRESETS.find(
    (item) => presetValue(item.label) === endpoint,
  )
  const selectedCustom = customEndpoints.find(
    (item) => customValue(item.id) === endpoint,
  )

  useEffect(() => {
    const matchedPreset = VISION_ENDPOINT_PRESETS.find(
      (item) => item.baseUrl === baseUrl && item.modelId === modelId,
    )
    const matchedCustom = customEndpoints.find(
      (item) =>
        item.baseUrl === baseUrl &&
        item.modelId === modelId &&
        Boolean(item.title?.trim()),
    )

    if (matchedPreset) {
      form.setFieldsValue({
        endpoint: presetValue(matchedPreset.label),
        title: '',
        baseUrl: matchedPreset.baseUrl,
        modelId: matchedPreset.modelId,
        apiKey: presetApiKeys[matchedPreset.label] ?? apiKey ?? '',
      })
    } else if (matchedCustom) {
      form.setFieldsValue({
        endpoint: customValue(matchedCustom.id),
        title: matchedCustom.title,
        baseUrl: matchedCustom.baseUrl,
        modelId: matchedCustom.modelId,
        apiKey: matchedCustom.apiKey ?? apiKey ?? '',
      })
    } else {
      const defaultPreset = VISION_ENDPOINT_PRESETS[0]
      form.setFieldsValue({
        endpoint: presetValue(defaultPreset.label),
        title: '',
        baseUrl: defaultPreset.baseUrl,
        modelId: defaultPreset.modelId,
        apiKey: presetApiKeys[defaultPreset.label] ?? '',
      })
    }
  }, [form, apiKey, baseUrl, customEndpoints, modelId, presetApiKeys])

  const handleEndpointChange = (value: string) => {
    if (value === NEW_CUSTOM_VALUE) {
      form.setFieldsValue({
        title: '',
        baseUrl: '',
        modelId: '',
        apiKey: '',
      })
      return
    }

    const preset = VISION_ENDPOINT_PRESETS.find(
      (item) => presetValue(item.label) === value,
    )
    if (preset) {
      form.setFieldsValue({
        title: '',
        baseUrl: preset.baseUrl,
        modelId: preset.modelId,
        apiKey: presetApiKeys[preset.label] ?? '',
      })
      return
    }

    const custom = customEndpoints.find(
      (item) => customValue(item.id) === value,
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

  const handleDeleteCustom = async (id: string) => {
    const target = customEndpoints.find((item) => item.id === id)
    if (!target) return

    await setCustomEndpoints(customEndpoints.filter((item) => item.id !== id))
    if (target.baseUrl === baseUrl && target.modelId === modelId) {
      const preset = VISION_ENDPOINT_PRESETS[0]
      await setEndpoint(preset.baseUrl, preset.modelId)
    }
    message.success('已删除自定义视觉接入点')
  }

  useImperativeHandle(ref, () => ({
    save: async () => {
      const values = await form.validateFields()
      const key = String(values.apiKey).trim()

      let nextBaseUrl: string
      let nextModelId: string
      if (values.endpoint === NEW_CUSTOM_VALUE) {
        nextBaseUrl = values.baseUrl.trim()
        nextModelId = values.modelId.trim()
        const title = values.title.trim()
        const existingIndex = customEndpoints.findIndex(
          (item) =>
            item.baseUrl === nextBaseUrl && item.modelId === nextModelId,
        )
        const nextEndpoints =
          existingIndex >= 0
            ? customEndpoints.map((item, index) =>
                index === existingIndex
                  ? { ...item, title, apiKey: key }
                  : item,
              )
            : [
                ...customEndpoints.filter((item) =>
                  Boolean(item.title?.trim()),
                ),
                {
                  id: generateId(),
                  title,
                  baseUrl: nextBaseUrl,
                  modelId: nextModelId,
                  apiKey: key,
                },
              ]
        await setCustomEndpoints(nextEndpoints)
      } else if (values.endpoint.startsWith('custom:')) {
        const custom = customEndpoints.find(
          (item) => customValue(item.id) === values.endpoint,
        )!
        nextBaseUrl = values.baseUrl.trim()
        nextModelId = values.modelId.trim()
        const title = values.title.trim()
        await setCustomEndpoints(
          customEndpoints
            .filter(
              (item) => item.id === custom.id || Boolean(item.title?.trim()),
            )
            .map((item) =>
              item.id === custom.id
                ? {
                    ...item,
                    title,
                    baseUrl: nextBaseUrl,
                    modelId: nextModelId,
                    apiKey: key,
                  }
                : item,
            ),
        )
      } else {
        const preset = VISION_ENDPOINT_PRESETS.find(
          (item) => presetValue(item.label) === values.endpoint,
        )!
        nextBaseUrl = preset.baseUrl
        nextModelId = preset.modelId
        await setPresetApiKeys({
          ...presetApiKeys,
          [preset.label]: key,
        })
      }

      await setEndpoint(nextBaseUrl, nextModelId)
      message.success('视觉接入点配置保存成功')
      return key
    },
  }))

  return (
    <div className="px-4 py-2">
      <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5">
        <div className="min-w-0">
          <div className="text-sm font-medium text-amber-800">
            {noticeTitle}
          </div>
          <div className="mt-1 text-xs leading-5 text-amber-700">{notice}</div>
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
            optionRender={(option) => {
              const value = String(option.value)
              if (!value.startsWith('custom:')) return option.label
              const id = value.slice('custom:'.length)
              return (
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{option.label}</span>
                  <CloseOutlined
                    className="rounded p-0.5 text-gray-400 hover:bg-gray-500/20 hover:text-red-500"
                    title="删除该接入点"
                    onMouseDown={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                    }}
                    onClick={(event) => {
                      event.stopPropagation()
                      handleDeleteCustom(id)
                    }}
                  />
                </div>
              )
            }}
            options={[
              ...VISION_ENDPOINT_PRESETS.map((item) => ({
                label: item.label,
                value: presetValue(item.label),
              })),
              ...customEndpoints
                .filter((item) => Boolean(item.title?.trim()))
                .map((item) => ({
                  label: item.title,
                  value: customValue(item.id),
                })),
              { label: '新增自定义接入点', value: NEW_CUSTOM_VALUE },
            ]}
          />
        </Form.Item>
        {(isNewCustom || selectedCustom) && (
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
                { type: 'url', message: '请输入合法的 URL' },
              ]}
            >
              <Input placeholder="例如 https://api.example.com/v1" />
            </Form.Item>
            <Form.Item
              name="modelId"
              label="模型 ID"
              rules={[{ required: true, message: '请输入模型 ID' }]}
            >
              <Input placeholder="例如 gpt-5.6-luna" />
            </Form.Item>
          </>
        )}
        <Form.Item
          name="apiKey"
          label="API Key"
          rules={[{ required: true, message: '请输入 API Key' }]}
        >
          <Input.Password placeholder="输入 API Key" />
        </Form.Item>
      </Form>
    </div>
  )
})
