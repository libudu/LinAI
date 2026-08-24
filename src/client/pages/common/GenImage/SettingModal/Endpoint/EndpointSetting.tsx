import { isVeniceEndpoint } from '@/server/module/gpt-image/enum'
import { CloseOutlined } from '@ant-design/icons'
import { Form, Input, message, Select } from 'antd'
import { forwardRef, useEffect, useImperativeHandle } from 'react'
import { useGptImageStore } from '../../store'
import { ENDPOINT_PRESETS } from './endpointPresets'

// 「新增自定义接入点」的下拉值
const NEW_CUSTOM_VALUE = '__new_custom__'

// 下拉值与接入点的互转（不同预设可能共用 baseUrl/modelId，必须用 label 做值）
const presetValue = (label: string) => `preset:${label}`
const customValue = (id: string) => `custom:${id}`

const generateId = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

export interface EndpointSettingRef {
  save: () => Promise<string | undefined>
}

export const EndpointSetting = forwardRef<EndpointSettingRef>((_props, ref) => {
  const [form] = Form.useForm()
  const {
    gptImageApiKey,
    gptImageBaseUrl,
    gptImageModelId,
    gptImageCustomEndpoints,
    gptImagePresetApiKeys,
    setGptImageEndpoint,
    setGptImageCustomEndpoints,
    setGptImagePresetApiKeys,
  } = useGptImageStore()

  const endpoint = Form.useWatch('endpoint', form)
  const baseUrlValue = Form.useWatch('baseUrl', form)
  const isNewCustom = endpoint === NEW_CUSTOM_VALUE
  const selectedPreset = ENDPOINT_PRESETS.find(
    (p) => presetValue(p.label) === endpoint,
  )
  const selectedCustom = gptImageCustomEndpoints.find(
    (c) => customValue(c.id) === endpoint,
  )

  useEffect(() => {
    // 根据已保存的 baseUrl/modelId 反推下拉选中项：优先匹配预设，其次已保存的自定义接入点（必须有标题），
    // 否则（如旧预设被废弃后的残留配置）直接丢弃该结果，回退到默认预设并显示让用户填写的状态
    const matchedPreset = ENDPOINT_PRESETS.find(
      (p) => p.baseUrl === gptImageBaseUrl && p.modelId === gptImageModelId,
    )
    const matchedCustom = gptImageCustomEndpoints.find(
      (c) =>
        c.baseUrl === gptImageBaseUrl &&
        c.modelId === gptImageModelId &&
        Boolean(c.title?.trim()),
    )

    if (matchedPreset) {
      form.setFieldsValue({
        apiKey:
          gptImagePresetApiKeys[matchedPreset.label] ??
          (matchedPreset.label.startsWith('【已废弃】')
            ? gptImagePresetApiKeys[
                matchedPreset.label.replace('【已废弃】', '')
              ]
            : undefined) ??
          gptImageApiKey ??
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
      // 既不是预设也不是有标题的自定义接入点（如旧预设已丢弃）：丢弃结果，默认选择第一个预设让用户填写
      const defaultPreset = ENDPOINT_PRESETS[0]
      form.setFieldsValue({
        apiKey: gptImagePresetApiKeys[defaultPreset.label] ?? '',
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
    form,
  ])

  // 切换下拉选项时，同步填充/清空接入点信息与对应的 API Key
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
    const preset = ENDPOINT_PRESETS.find((p) => presetValue(p.label) === value)
    if (preset) {
      form.setFieldsValue({
        title: '',
        baseUrl: preset.baseUrl,
        modelId: preset.modelId,
        apiKey:
          gptImagePresetApiKeys[preset.label] ??
          (preset.label.startsWith('【已废弃】')
            ? gptImagePresetApiKeys[preset.label.replace('【已废弃】', '')]
            : undefined) ??
          '',
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

  // 删除自定义接入点；若删的是当前正在使用的接入点，回退到第一个预设
  const handleDeleteCustom = async (id: string) => {
    const target = gptImageCustomEndpoints.find((c) => c.id === id)
    if (!target) return
    await setGptImageCustomEndpoints(
      gptImageCustomEndpoints.filter((c) => c.id !== id),
    )
    if (
      target.baseUrl === gptImageBaseUrl &&
      target.modelId === gptImageModelId
    ) {
      const preset = ENDPOINT_PRESETS[0]
      await setGptImageEndpoint(preset.baseUrl, preset.modelId)
    }
    message.success('已删除自定义接入点')
  }

  useImperativeHandle(ref, () => ({
    save: async () => {
      const values = await form.validateFields()
      if (!values.apiKey) {
        message.warning('请输入 API Key')
        throw new Error('No API Key')
      }

      let baseUrl: string
      let modelId: string
      const apiKey: string = values.apiKey
      if (values.endpoint === NEW_CUSTOM_VALUE) {
        baseUrl = values.baseUrl.trim()
        modelId = values.modelId.trim()
        const title = values.title.trim()
        // 相同 baseUrl + modelId 的自定义接入点已存在时更新标题与 API Key，否则新增一条
        const existingIndex = gptImageCustomEndpoints.findIndex(
          (c) => c.baseUrl === baseUrl && c.modelId === modelId,
        )
        const nextCustomEndpoints =
          existingIndex >= 0
            ? gptImageCustomEndpoints.map((c, i) =>
                i === existingIndex ? { ...c, title, apiKey } : c,
              )
            : [
                ...gptImageCustomEndpoints.filter((c) =>
                  Boolean(c.title?.trim()),
                ),
                { id: generateId(), title, baseUrl, modelId, apiKey },
              ]
        await setGptImageCustomEndpoints(nextCustomEndpoints)
      } else if (values.endpoint.startsWith('custom:')) {
        const custom = gptImageCustomEndpoints.find(
          (c) => customValue(c.id) === values.endpoint,
        )!
        baseUrl = values.baseUrl.trim()
        modelId = values.modelId.trim()
        const title = values.title.trim()
        // 保存时同步更新该自定义接入点的标题、baseUrl、modelId 与 API Key
        await setGptImageCustomEndpoints(
          gptImageCustomEndpoints
            .filter((c) => c.id === custom.id || Boolean(c.title?.trim()))
            .map((c) =>
              c.id === custom.id
                ? { ...c, title, baseUrl, modelId, apiKey }
                : c,
            ),
        )
      } else {
        const preset = ENDPOINT_PRESETS.find(
          (p) => presetValue(p.label) === values.endpoint,
        )!
        baseUrl = preset.baseUrl
        modelId = preset.modelId
        // 预设接入点的 API Key 按预设 label 持久化到 config
        await setGptImagePresetApiKeys({
          ...gptImagePresetApiKeys,
          [preset.label]: apiKey,
        })
      }

      // 生效密钥按接入点从 keychain 解析与读写（shared/gpt-image/endpoints.ts），
      // 无需再单独维护 gptImageApiKey 平铺字段
      await setGptImageEndpoint(baseUrl, modelId)
      message.success('配置保存成功')
      return values.apiKey
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
              if (!value.startsWith('custom:')) return option.label
              const id = value.slice('custom:'.length)
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
                      handleDeleteCustom(id)
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
              extra={
                isVeniceEndpoint(baseUrlValue)
                  ? '已识别为 Venice 特殊适配接入点：带参考图时将自动使用 image/multi-edit 接口'
                  : undefined
              }
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
          <Input.Password placeholder="输入 API Key" />
        </Form.Item>
      </Form>
    </div>
  )
})
