import { Button, Form, Input, message } from 'antd'
import { hc } from 'hono/client'
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import type { AppType } from '../../../server'
import { useLocalSetting } from '../../hooks/useLocalSetting'

export interface AdminSettingRef {
  save: () => Promise<void>
}

const client = hc<AppType>('/')
const fixedGroup = '限时特价,default,逆向,纯AZ,官转'

export const AdminSetting = forwardRef<AdminSettingRef>((_props, ref) => {
  const [form] = Form.useForm()
  const { yunwuSystemToken, setYunwuSystemToken, yunwuUserId, setYunwuUserId } =
    useLocalSetting()
  const [loading, setLoading] = useState(false)
  const [generatedApiKey, setGeneratedApiKey] = useState<string>('')

  useEffect(() => {
    form.setFieldsValue({
      yunwuSystemToken: yunwuSystemToken || '',
      yunwuUserId: yunwuUserId || '',
      name: '',
      quota: 10
    })
  }, [yunwuSystemToken, yunwuUserId, form])

  useImperativeHandle(ref, () => ({
    save: async () => {
      const values = await form.validateFields()
      setYunwuSystemToken(values.yunwuSystemToken)
      setYunwuUserId(values.yunwuUserId)
    }
  }))

  const handleGenerate = async () => {
    try {
      const values = await form.validateFields()
      setLoading(true)
      setGeneratedApiKey('')

      console.log(values)

      const response = await client.api.gptImage['generate-api-key'].$post({
        json: {
          systemToken: values.yunwuSystemToken,
          userId: values.yunwuUserId,
          name: values.name,
          quota: Number(values.quota),
          group: fixedGroup
        }
      })
      const data = await response.json()

      if (data.success || data.data) {
        message.success('API Key 生成成功')
        setGeneratedApiKey(typeof data.data === 'string' ? data.data : '')
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
          name="yunwuSystemToken"
          label="云雾系统令牌"
          rules={[{ required: true, message: '请输入云雾系统令牌' }]}
        >
          <Input.Password placeholder="请输入云雾系统令牌" />
        </Form.Item>
        <Form.Item
          name="yunwuUserId"
          label="云雾用户 ID"
          rules={[{ required: true, message: '请输入云雾用户 ID' }]}
        >
          <Input placeholder="请输入云雾用户 ID" />
        </Form.Item>
        <Form.Item
          name="name"
          label="API Key 标题"
          rules={[{ required: true, message: '请输入 API Key 标题' }]}
        >
          <Input placeholder="请输入 API Key 标题" />
        </Form.Item>
        <Form.Item
          name="quota"
          label="限额 (RMB)"
          rules={[{ required: true, message: '请输入限额' }]}
        >
          <Input type="number" placeholder="请输入限额" />
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

      {generatedApiKey && (
        <div className="mt-4 rounded-md border border-green-200 bg-green-50 p-4">
          <div className="mb-2 text-sm font-medium text-green-800">
            生成成功！请妥善保存您的 API Key：
          </div>
          <div className="flex items-center gap-2">
            <Input value={generatedApiKey} readOnly />
            <Button
              onClick={() => {
                navigator.clipboard.writeText(generatedApiKey)
                message.success('已复制到剪贴板')
              }}
            >
              复制
            </Button>
          </div>
        </div>
      )}
    </div>
  )
})
