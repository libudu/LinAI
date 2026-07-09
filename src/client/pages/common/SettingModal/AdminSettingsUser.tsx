import { Button, Form, Input, Tag, message } from 'antd'
import { CheckCircleOutlined, KeyOutlined, LockOutlined, UserOutlined, WarningOutlined } from '@ant-design/icons'
import type { FormInstance } from 'antd/es/form'

interface Props {
  form: FormInstance
  onSave: (token: string, userId: string) => void
  token?: string
  userId?: string
}

export function AdminSettingsUser({ form, onSave, token, userId }: Props) {
  const configured = !!(token && userId)

  // Track whether form values differ from saved values
  const formToken = Form.useWatch('yunwuSystemToken', form)
  const formUserId = Form.useWatch('yunwuUserId', form)
  const dirty = formToken !== (token ?? '') || formUserId !== (userId ?? '')


  const handleSave = async () => {
    try {
      const values = await form.validateFields(['yunwuSystemToken', 'yunwuUserId'])
      onSave(values.yunwuSystemToken, values.yunwuUserId)
      message.success('云雾用户设置已保存')
    } catch {
      // antd validation handles display
    }
  }

  return (
    <div className="rounded-lg border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-5">
      {/* Header with status */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-lg">
            ☁️
          </span>
          <div>
            <div className="text-sm font-medium text-gray-800">云雾用户设置</div>
            <div className="text-xs leading-tight text-gray-400">
              所有 API Key 管理功能的前置条件
            </div>
          </div>
        </div>
        <Tag
          icon={dirty ? <WarningOutlined /> : configured ? <CheckCircleOutlined /> : <LockOutlined />}
          color={dirty ? 'warning' : configured ? 'success' : 'warning'}
          className="!m-0 !inline-flex !items-center !gap-1 !rounded-full !px-3 !text-xs"
        >
          {dirty ? '未保存' : configured ? '已配置' : '未配置'}
        </Tag>
      </div>

      {/* System token */}
      <Form.Item
        name="yunwuSystemToken"
        label={<span className="text-xs text-gray-500">系统令牌</span>}
        rules={[{ required: true, message: '请输入云雾系统令牌' }]}
      >
        <Input.Password
          placeholder="请输入云雾系统令牌"
          prefix={<KeyOutlined className="text-gray-300" />}
          className="bg-white"
        />
      </Form.Item>

      {/* User ID + Save — manual label keeps input and button aligned */}
      <div className="flex gap-3">
        <div className="flex-1">
          <div className="mb-1 text-xs text-gray-500">用户 ID</div>
          <Form.Item
            name="yunwuUserId"
            rules={[{ required: true, message: '请输入云雾用户 ID' }]}
            noStyle
          >
            <Input
              placeholder="请输入云雾用户 ID"
              prefix={<UserOutlined className="text-gray-300" />}
              className="bg-white"
              style={{ width: '100%' }}
            />
          </Form.Item>
        </div>
        {/* paddingTop matches Form.Item label height (~12px font + 4px pb + 1px gap) so button aligns with input */}
        <div style={{ paddingTop: '17px' }}>
          <Button type="primary" onClick={handleSave}>
            保存配置
          </Button>
        </div>
      </div>

      {/* Helper hint */}
      <p className="mb-0 mt-2 text-xs text-gray-400">
        {configured
          ? '已配置用户凭据，下方 API Key 管理功能已可用'
          : '请填写系统令牌和用户 ID 后点击保存，以启用 API Key 管理功能'}
      </p>
    </div>
  )
}
