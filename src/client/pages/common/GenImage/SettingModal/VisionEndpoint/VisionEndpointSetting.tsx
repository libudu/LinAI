import { CloseOutlined } from '@ant-design/icons'
import { Form, Input, message, Select } from 'antd'
import { forwardRef, useEffect, useImperativeHandle } from 'react'
import { useVisionStore } from '../../visionStore'
import { VISION_ENDPOINT_PRESETS } from './visionEndpointPresets'

const NEW_CUSTOM_VALUE = '__new_custom__'
const presetValue = (label: string) => `preset:${label}`
const customValue = (id: string) => `custom:${id}`
const generateId = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

export interface VisionEndpointSettingRef {
  save: () => Promise<string | undefined>
}

export const VisionEndpointSetting = forwardRef<VisionEndpointSettingRef>(
  (_props, ref) => {
    const [form] = Form.useForm()
    const {
      visionApiKey,
      visionBaseUrl,
      visionModelId,
      visionCustomEndpoints,
      visionPresetApiKeys,
      setVisionEndpoint,
      setVisionCustomEndpoints,
      setVisionPresetApiKeys,
    } = useVisionStore()

    const endpoint = Form.useWatch('endpoint', form)
    const isNewCustom = endpoint === NEW_CUSTOM_VALUE
    const selectedPreset = VISION_ENDPOINT_PRESETS.find(
      (item) => presetValue(item.label) === endpoint,
    )
    const selectedCustom = visionCustomEndpoints.find(
      (item) => customValue(item.id) === endpoint,
    )

    useEffect(() => {
      const matchedPreset = VISION_ENDPOINT_PRESETS.find(
        (item) =>
          item.baseUrl === visionBaseUrl && item.modelId === visionModelId,
      )
      const matchedCustom = visionCustomEndpoints.find(
        (item) =>
          item.baseUrl === visionBaseUrl && item.modelId === visionModelId,
      )
      const endpointValue = !visionBaseUrl
        ? presetValue(VISION_ENDPOINT_PRESETS[0].label)
        : matchedPreset
          ? presetValue(matchedPreset.label)
          : matchedCustom
            ? customValue(matchedCustom.id)
            : NEW_CUSTOM_VALUE

      form.setFieldsValue({
        endpoint: endpointValue,
        title: matchedCustom?.title ?? '',
        baseUrl: visionBaseUrl,
        modelId: visionModelId,
        apiKey: visionApiKey || '',
      })
    }, [
      form,
      visionApiKey,
      visionBaseUrl,
      visionCustomEndpoints,
      visionModelId,
    ])

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
          apiKey: visionPresetApiKeys[preset.label] ?? '',
        })
        return
      }

      const custom = visionCustomEndpoints.find(
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
      const target = visionCustomEndpoints.find((item) => item.id === id)
      if (!target) return

      await setVisionCustomEndpoints(
        visionCustomEndpoints.filter((item) => item.id !== id),
      )
      if (
        target.baseUrl === visionBaseUrl &&
        target.modelId === visionModelId
      ) {
        const preset = VISION_ENDPOINT_PRESETS[0]
        await setVisionEndpoint(preset.baseUrl, preset.modelId)
      }
      message.success('已删除自定义视觉接入点')
    }

    useImperativeHandle(ref, () => ({
      save: async () => {
        const values = await form.validateFields()
        const apiKey = String(values.apiKey).trim()

        let baseUrl: string
        let modelId: string
        if (values.endpoint === NEW_CUSTOM_VALUE) {
          baseUrl = values.baseUrl.trim()
          modelId = values.modelId.trim()
          const title = values.title.trim()
          const existingIndex = visionCustomEndpoints.findIndex(
            (item) => item.baseUrl === baseUrl && item.modelId === modelId,
          )
          const nextEndpoints =
            existingIndex >= 0
              ? visionCustomEndpoints.map((item, index) =>
                  index === existingIndex
                    ? { ...item, title, apiKey }
                    : item,
                )
              : [
                  ...visionCustomEndpoints,
                  { id: generateId(), title, baseUrl, modelId, apiKey },
                ]
          await setVisionCustomEndpoints(nextEndpoints)
        } else if (values.endpoint.startsWith('custom:')) {
          const custom = visionCustomEndpoints.find(
            (item) => customValue(item.id) === values.endpoint,
          )!
          baseUrl = values.baseUrl.trim()
          modelId = values.modelId.trim()
          const title = values.title.trim()
          await setVisionCustomEndpoints(
            visionCustomEndpoints.map((item) =>
              item.id === custom.id
                ? { ...item, title, baseUrl, modelId, apiKey }
                : item,
            ),
          )
        } else {
          const preset = VISION_ENDPOINT_PRESETS.find(
            (item) => presetValue(item.label) === values.endpoint,
          )!
          baseUrl = preset.baseUrl
          modelId = preset.modelId
          await setVisionPresetApiKeys({
            ...visionPresetApiKeys,
            [preset.label]: apiKey,
          })
        }

        await setVisionEndpoint(baseUrl, modelId)
        message.success('视觉接入点配置保存成功')
        return apiKey
      },
    }))

    return (
      <div className="px-4 py-2">
        <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5">
          <div className="min-w-0">
            <div className="text-sm font-medium text-amber-800">
              视觉接入点独立配置
            </div>
            <div className="mt-1 text-xs leading-5 text-amber-700">
              此处的 API Key 不与生图接入点共用；第三方中转站请小额试用、随用随充。
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
                ...visionCustomEndpoints.map((item) => ({
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
  },
)
