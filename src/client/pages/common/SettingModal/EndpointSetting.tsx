import { Form, Input, message, Select } from 'antd'
import { forwardRef, useEffect, useImperativeHandle } from 'react'
import { useGlobalStore } from '../../../store/global'
import { ENDPOINT_PRESETS } from './endpointPresets'

// 自定义接入点的下拉值
const CUSTOM_VALUE = 'custom'

export interface EndpointSettingRef {
  save: () => Promise<string | undefined>
}

export const EndpointSetting = forwardRef<EndpointSettingRef>((_props, ref) => {
  const [form] = Form.useForm()
  const {
    gptImageApiKey,
    gptImageBaseUrl,
    gptImageModelId,
    setGptImageApiKey,
    setGptImageEndpoint,
  } = useGlobalStore()

  const endpoint = Form.useWatch('endpoint', form)
  const isCustom = endpoint === CUSTOM_VALUE

  useEffect(() => {
    // 根据已保存的 baseUrl/modelId 反推下拉选中项：匹配预设则选预设，否则视为自定义
    const matchedPreset = ENDPOINT_PRESETS.find(
      (p) => p.baseUrl === gptImageBaseUrl && p.modelId === gptImageModelId,
    )
    const endpointValue = !gptImageBaseUrl
      ? ENDPOINT_PRESETS[0].baseUrl
      : matchedPreset
        ? matchedPreset.baseUrl
        : CUSTOM_VALUE
    form.setFieldsValue({
      apiKey: gptImageApiKey || '',
      endpoint: endpointValue,
      baseUrl: gptImageBaseUrl || '',
      modelId: gptImageModelId || '',
    })
  }, [gptImageApiKey, gptImageBaseUrl, gptImageModelId, form])

  useImperativeHandle(ref, () => ({
    save: async () => {
      const values = await form.validateFields()
      if (!values.apiKey) {
        message.warning('请输入 API Key')
        throw new Error('No API Key')
      }

      let baseUrl: string
      let modelId: string
      if (values.endpoint === CUSTOM_VALUE) {
        baseUrl = values.baseUrl.trim()
        modelId = values.modelId.trim()
      } else {
        const preset = ENDPOINT_PRESETS.find(
          (p) => p.baseUrl === values.endpoint,
        )!
        baseUrl = preset.baseUrl
        modelId = preset.modelId
      }

      await setGptImageApiKey(values.apiKey)
      await setGptImageEndpoint(baseUrl, modelId)
      message.success('配置保存成功')
      return values.apiKey
    },
  }))

  return (
    <div className="px-4 py-2">
      <Form form={form} layout="vertical">
        <Form.Item
          name="endpoint"
          label="接入点"
          rules={[{ required: true, message: '请选择接入点' }]}
        >
          <Select
            options={[
              ...ENDPOINT_PRESETS.map((p) => ({
                label: p.label,
                value: p.baseUrl,
              })),
              { label: '自定义', value: CUSTOM_VALUE },
            ]}
          />
        </Form.Item>
        {isCustom && (
          <>
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
              <Input placeholder="例如 gpt-image-2" />
            </Form.Item>
          </>
        )}
        <Form.Item
          name="apiKey"
          label="API Key"
          rules={[{ required: true, message: '请输入 API Key' }]}
        >
          <Input.Password placeholder="输入云雾 API Key" />
        </Form.Item>
      </Form>
    </div>
  )
})
