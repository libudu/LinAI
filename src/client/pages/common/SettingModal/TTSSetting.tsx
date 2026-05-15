import { Form, Input, message } from 'antd'
import { forwardRef, useEffect, useImperativeHandle } from 'react'
import { useGlobalStore } from '../../../store/global'

export interface TTSSettingRef {
  save: () => Promise<string | undefined>
}

export const TTSSetting = forwardRef<TTSSettingRef>((_props, ref) => {
  const [form] = Form.useForm()
  const { ttsInworldApiKey, setTTSInworldApiKey } = useGlobalStore()

  useEffect(() => {
    form.setFieldsValue({
      apiKey: ttsInworldApiKey || '',
    })
  }, [ttsInworldApiKey, form])

  useImperativeHandle(ref, () => ({
    save: async () => {
      const values = await form.validateFields()
      if (!values.apiKey) {
        message.warning('请输入 API Key')
        throw new Error('No API Key')
      }
      await setTTSInworldApiKey(values.apiKey)
      message.success('配置保存成功')
      return values.apiKey
    },
  }))

  return (
    <div className="px-4 py-2">
      <Form form={form} layout="vertical">
        <Form.Item
          name="apiKey"
          label="Inworld API Key"
          rules={[{ required: true, message: '请输入 API Key' }]}
        >
          <Input.Password placeholder="输入 Inworld API Key" />
        </Form.Item>
      </Form>
    </div>
  )
})
