import { settingsClient } from '@/client/service/settings'
import type { EagleSharingSettings } from '@/server/module/eagle/settings'
import {
  Alert,
  Button,
  Form,
  Input,
  List,
  Popconfirm,
  Space,
  Typography,
} from 'antd'
import { useEffect, useRef, useState } from 'react'
import { ensureEagleOwnerSession } from '../sharing/access'

const client = settingsClient<EagleSharingSettings>('eagle-sharing')
const randomCode = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return [...crypto.getRandomValues(new Uint8Array(8))]
    .map((byte) => alphabet[byte % alphabet.length])
    .join('')
}

export function SharingUsersSetting() {
  const [form] = Form.useForm()
  const [users, setUsers] = useState<EagleSharingSettings['users']>([])
  const [revision, setRevision] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const saving = useRef(false)
  const load = async () => {
    try {
      await ensureEagleOwnerSession()
      const result = await client.get()
      setUsers(result.value.users)
      setRevision(result.revision)
      setLoaded(true)
      setError('')
    } catch (error) {
      setError(error instanceof Error ? error.message : '加载共享用户失败')
    }
  }
  useEffect(() => {
    void load()
    form.setFieldsValue({ invitationCode: randomCode() })
  }, [form])
  const save = async (next: EagleSharingSettings['users']) => {
    if (saving.current) return false
    saving.current = true
    setBusy(true)
    setError('')
    try {
      await ensureEagleOwnerSession()
      const result = await client.put({ users: next }, revision)
      setUsers(result.value.users)
      setRevision(result.revision)
      return true
    } catch (error) {
      setError(
        error instanceof Error ? error.message : '保存失败，请重新加载后重试',
      )
      return false
    } finally {
      saving.current = false
      setBusy(false)
    }
  }
  return (
    <div className="space-y-4 px-4 py-2">
      <p className="text-sm text-slate-500">
        为每位共享用户生成独立邀请码。对方输入邀请码后，仍需你在前端同意本次共享；删除用户将终止该用户的连接。
      </p>
      {error && (
        <Alert
          type="error"
          showIcon
          title={error}
          action={
            <Button size="small" disabled={busy} onClick={() => void load()}>
              重新加载
            </Button>
          }
        />
      )}
      <List
        loading={!loaded && !error}
        dataSource={users}
        locale={{ emptyText: '尚未添加共享用户' }}
        renderItem={(user) => (
          <List.Item
            actions={[
              <Popconfirm
                key="delete"
                title={`删除共享用户「${user.name}」？`}
                onConfirm={() =>
                  save(
                    users.filter(
                      (entry) => entry.invitationCode !== user.invitationCode,
                    ),
                  )
                }
                okText="删除"
                cancelText="取消"
              >
                <Button danger type="text" disabled={busy}>
                  删除
                </Button>
              </Popconfirm>,
            ]}
          >
            <List.Item.Meta
              title={user.name}
              description={
                <Typography.Text copyable>
                  {user.invitationCode}
                </Typography.Text>
              }
            />
          </List.Item>
        )}
      />
      <Form
        form={form}
        layout="vertical"
        disabled={!loaded || busy}
        onFinish={async (values: EagleSharingSettings['users'][number]) => {
          if (
            users.some((user) => user.invitationCode === values.invitationCode)
          ) {
            setError('邀请码已存在，请重新生成')
            return
          }
          if (await save([...users, values]))
            form.setFieldsValue({ name: '', invitationCode: randomCode() })
        }}
      >
        <Form.Item
          name="name"
          label="名字"
          rules={[
            {
              required: true,
              whitespace: true,
              message: '请输入共享用户的名字',
            },
            { max: 80 },
          ]}
        >
          <Input maxLength={80} placeholder="共享用户的名字" />
        </Form.Item>
        <Form.Item label="邀请码" required>
          <Space.Compact className="w-full">
            <Form.Item
              name="invitationCode"
              noStyle
              rules={[
                {
                  pattern: /^[A-Za-z0-9]{8}$/,
                  required: true,
                  message: '邀请码必须是八位字母或数字',
                },
              ]}
            >
              <Input readOnly />
            </Form.Item>
            <Button
              onClick={() => form.setFieldValue('invitationCode', randomCode())}
            >
              重新生成
            </Button>
          </Space.Compact>
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={busy}>
          新增共享用户
        </Button>
      </Form>
    </div>
  )
}
