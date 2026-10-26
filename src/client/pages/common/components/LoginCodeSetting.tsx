import { useLoginAccess } from '@/client/service/auth'
import { settingsClient } from '@/client/service/settings'
import type { SystemSettings } from '@/server/module/system/settings'
import { Alert, Button, Form, Input, message } from 'antd'
import { useEffect, useState } from 'react'

const client = settingsClient<SystemSettings>('system')

export function LoginCodeSetting() {
  const [form] = Form.useForm<SystemSettings>()
  const [revision, setRevision] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const load = async () => {
    setError('')
    try {
      const result = await client.get()
      setRevision(result.revision)
      form.setFieldsValue(result.value)
      setLoaded(true)
    } catch (error) {
      setError(error instanceof Error ? error.message : '读取验证码设置失败')
    }
  }
  useEffect(() => {
    void load()
  }, [form])
  return (
    <div className="space-y-3">
      <Form
        form={form}
        layout="vertical"
        disabled={!loaded || saving}
        onFinish={async (values) => {
          if (saving) return
          setSaving(true)
          setError('')
          try {
            const result = await client.put(values, revision)
            setRevision(result.revision)
            await useLoginAccess.getState().fetchStatus()
            message.success('登录验证码已保存')
          } catch (error) {
            setError(
              error instanceof Error ? error.message : '保存登录验证码失败',
            )
          } finally {
            setSaving(false)
          }
        }}
      >
        <Form.Item
          name="loginCode"
          label="登录验证码"
          extra="请输入六位数字。非 localhost 访问需要验证，登录 Cookie 保留 30 天；连续输错三次锁定五分钟。修改验证码后，已有登录会话失效。"
          rules={[
            {
              required: true,
              pattern: /^\d{6}$/,
              message: '请输入六位数字验证码',
            },
          ]}
        >
          <Input.Password
            maxLength={6}
            inputMode="numeric"
            autoComplete="new-password"
            placeholder="六位数字"
          />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={saving}>
          保存验证码
        </Button>
      </Form>
      {error && (
        <Alert
          type="error"
          showIcon
          title={error}
          action={
            <Button size="small" disabled={saving} onClick={() => void load()}>
              重新加载
            </Button>
          }
        />
      )}
    </div>
  )
}
