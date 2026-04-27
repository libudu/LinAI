import { Button, Form, Input, message } from 'antd'
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { useLocalSetting } from '../../hooks/useLocalSetting'

export interface AdminSettingRef {
  save: () => Promise<void>
}

export const AdminSetting = forwardRef<AdminSettingRef>((_props, ref) => {
  const [form] = Form.useForm()
  const { systemToken, setSystemToken } = useLocalSetting()
  const [loading, setLoading] = useState(false)

  const fixedGroup = '限时特价,Codex专属,default,逆向,纯AZ,官转'

  useEffect(() => {
    form.setFieldsValue({
      systemToken: systemToken || '',
      name: ''
    })
  }, [systemToken, form])

  useImperativeHandle(ref, () => ({
    save: async () => {
      const values = await form.validateFields()
      setSystemToken(values.systemToken)
    }
  }))

  const handleGenerate = async () => {
    try {
      const values = await form.validateFields()
      setLoading(true)

      const response = await fetch('https://yunwu.ai/api/token/', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'new-api-user': '1',
          ...(values.systemToken ? { Authorization: values.systemToken } : {})
        },
        body: JSON.stringify({
          remain_quota: 10 * 1000000,
          expired_time: -1,
          unlimited_quota: false,
          model_limits_enabled: false,
          model_limits: '',
          group: fixedGroup,
          mj_image_mode: 'default',
          mj_custom_proxy: '',
          selected_groups: [],
          name: values.name,
          allow_ips: ''
        })
      })

      const data = await response.json()
      if (data.success || data.data) {
        message.success('API Key 生成成功')
      } else {
        message.error(data.message || '生成失败')
      }
    } catch (error: any) {
      message.error(error.message || '请求失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="px-4 py-2">
      <Form form={form} layout="vertical">
        <Form.Item
          name="systemToken"
          label="云雾系统令牌"
          rules={[{ required: true, message: '请输入云雾系统令牌' }]}
        >
          <Input.Password placeholder="请输入云雾系统令牌" />
        </Form.Item>
        <Form.Item
          name="name"
          label="API Key 标题"
          rules={[{ required: true, message: '请输入 API Key 标题' }]}
        >
          <Input placeholder="请输入 API Key 标题" />
        </Form.Item>
        <Form.Item label="API Key 分组">
          <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
            {fixedGroup.replace(/,/g, ' → ')}
          </div>
        </Form.Item>
        <Form.Item>
          <Button type="primary" onClick={handleGenerate} loading={loading}>
            生成 API Key
          </Button>
        </Form.Item>
      </Form>
    </div>
  )
})
