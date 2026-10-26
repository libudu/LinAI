import { settingsClient } from '@/client/service/settings'
import { useGlobalStore } from '@/client/store/global'
import type { EagleSharingSettings } from '@/server/module/eagle/settings'
import {
  Alert,
  Button,
  Form,
  Input,
  Modal,
  Space,
  Table,
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
  const localNetworkUrl = useGlobalStore((state) => state.localNetworkUrl)
  const [form] = Form.useForm()
  const [users, setUsers] = useState<EagleSharingSettings['users']>([])
  const [revision, setRevision] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
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
  }, [])
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
      <div className="flex justify-end">
        <Button
          type="primary"
          disabled={!loaded || busy}
          onClick={() => {
            form.resetFields()
            form.setFieldsValue({ invitationCode: randomCode() })
            setError('')
            setAdding(true)
          }}
        >
          新增共享用户
        </Button>
      </div>
      <Table<EagleSharingSettings['users'][number]>
        rowKey="invitationCode"
        size="small"
        pagination={false}
        loading={!loaded && !error}
        dataSource={users}
        locale={{ emptyText: '尚未添加共享用户' }}
        footer={() => (
          <p className="text-sm text-slate-500">
            对方输入邀请码后，仍需你在前端同意本次共享；仅能查看在「展示选项 →
            共享文件夹可见性」中开放的文件夹。删除用户将终止该用户的连接。
          </p>
        )}
        columns={[
          {
            title: '名称',
            dataIndex: 'name',
            ellipsis: true,
          },
          {
            title: '邀请码',
            dataIndex: 'invitationCode',
            width: 140,
            render: (code: string) => (
              <Typography.Text
                copyable={{
                  text: `访问地址：${localNetworkUrl ?? window.location.origin}\n邀请码：${code}`,
                }}
                className="whitespace-nowrap"
              >
                {code}
              </Typography.Text>
            ),
          },
          {
            title: '操作',
            key: 'actions',
            width: 64,
            render: (_, user) => (
              <Button
                danger
                type="text"
                size="small"
                disabled={busy}
                onClick={() =>
                  void save(
                    users.filter(
                      (entry) => entry.invitationCode !== user.invitationCode,
                    ),
                  )
                }
              >
                删除
              </Button>
            ),
          },
        ]}
      />
      <Modal
        title="新增共享用户"
        open={adding}
        forceRender
        centered
        onCancel={() => {
          if (!saving.current) setAdding(false)
        }}
        onOk={() => form.submit()}
        okText="新增"
        cancelText="取消"
        confirmLoading={busy}
        cancelButtonProps={{ disabled: busy }}
        closable={!busy}
        maskClosable={!busy}
        keyboard={!busy}
      >
        {error && (
          <Alert type="error" showIcon title={error} className="mb-4" />
        )}
        <Form
          form={form}
          layout="vertical"
          disabled={!loaded || busy}
          onFinish={async (values: EagleSharingSettings['users'][number]) => {
            if (
              users.some(
                (user) => user.invitationCode === values.invitationCode,
              )
            ) {
              setError('邀请码已存在，请重新生成')
              return
            }
            if (await save([...users, values])) setAdding(false)
          }}
        >
          <Form.Item
            name="name"
            label="名称"
            rules={[
              {
                required: true,
                whitespace: true,
                message: '请输入共享用户的名称',
              },
              { max: 80 },
            ]}
          >
            <Input maxLength={80} placeholder="共享用户的名称" />
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
                onClick={() =>
                  form.setFieldValue('invitationCode', randomCode())
                }
              >
                重新生成
              </Button>
            </Space.Compact>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
