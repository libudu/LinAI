import { Form, Input, message } from 'antd'
import { forwardRef, useEffect, useImperativeHandle } from 'react'
import { useGlobalStore } from '../../../store/global'

export interface EndpointSettingRef {
  save: () => Promise<string | undefined>
}

export const EndpointSetting = forwardRef<EndpointSettingRef>((_props, ref) => {
  const [form] = Form.useForm()
  const { gptImageApiKey, setGptImageApiKey } = useGlobalStore()

  useEffect(() => {
    form.setFieldsValue({ apiKey: gptImageApiKey || '' })
  }, [gptImageApiKey, form])

  useImperativeHandle(ref, () => ({
    save: async () => {
      const values = await form.validateFields()
      if (!values.apiKey) {
        message.warning('请输入 API Key')
        throw new Error('No API Key')
      }
      await setGptImageApiKey(values.apiKey)
      message.success('配置保存成功')
      return values.apiKey
    },
  }))

  return (
    <div className="px-4 py-2">
      <Form form={form} layout="vertical">
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
