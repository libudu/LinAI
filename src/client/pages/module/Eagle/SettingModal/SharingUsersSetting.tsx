import { settingsClient } from '@/client/service/settings'
import type {
  EagleFolderSharingSettings,
  EagleSharingSettings,
} from '@/server/module/eagle/settings'
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
import { SharingHistoryButton } from '../sharing/SharingHistoryButton'

const client = settingsClient<EagleSharingSettings>('eagle-sharing')
const permissionsClient = settingsClient<EagleFolderSharingSettings>(
  'eagle-folder-sharing',
)
const randomCode = (excluded: ReadonlySet<string>) => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code: string
  do {
    code = [...crypto.getRandomValues(new Uint8Array(8))]
      .map((byte) => alphabet[byte % alphabet.length])
      .join('')
  } while (excluded.has(code))
  return code
}

type SharingUser = EagleSharingSettings['users'][number]

export function SharingUsersSetting() {
  const [form] = Form.useForm<Pick<SharingUser, 'name' | 'invitationCode'>>()
  const [users, setUsers] = useState<EagleSharingSettings['users']>([])
  const [revision, setRevision] = useState(0)
  const [reservedCodes, setReservedCodes] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<SharingUser | null>(null)
  const [error, setError] = useState('')
  const saving = useRef(false)
  const load = async () => {
    try {
      await ensureEagleOwnerSession()
      const [result, permissions] = await Promise.all([
        client.get(),
        permissionsClient.get(),
      ])
      setReservedCodes(
        permissions.value.libraries.flatMap((library) =>
          Object.keys(library.users),
        ),
      )
      setUsers(result.value.users)
      setRevision(result.revision)
      setLoaded(true)
      setError('')
      setEditorOpen(false)
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
  const generateCode = () =>
    randomCode(
      new Set([
        ...reservedCodes,
        ...users.flatMap((user) => [
          user.invitationCode,
          user.folderSharingCode ?? user.invitationCode,
        ]),
        form.getFieldValue('invitationCode'),
      ]),
    )
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
          disabled={!loaded || busy || users.length >= 100}
          onClick={() => {
            form.resetFields()
            form.setFieldsValue({ invitationCode: generateCode() })
            setEditingUser(null)
            setError('')
            setEditorOpen(true)
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
            共享方需先在系统设置中配置登录验证码。
            对方输入邀请码后，仍需你在前端同意本次共享；仅能查看在「展示选项 →
            共享文件夹可见性」中开放的文件夹。删除用户或保存新邀请码将终止该用户的连接。
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
                copyable={{ text: code }}
                className="whitespace-nowrap"
              >
                {code}
              </Typography.Text>
            ),
          },
          {
            title: '操作',
            key: 'actions',
            width: 184,
            render: (_, user) => (
              <Space size={0}>
                <SharingHistoryButton
                  groupId={user.invitationCode}
                  name={user.name}
                />
                <Button
                  type="text"
                  size="small"
                  disabled={busy}
                  onClick={() => {
                    form.resetFields()
                    form.setFieldsValue(user)
                    setEditingUser(user)
                    setError('')
                    setEditorOpen(true)
                  }}
                >
                  编辑
                </Button>
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
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={editingUser ? '编辑共享用户' : '新增共享用户'}
        open={editorOpen}
        forceRender
        centered
        onCancel={() => {
          if (!saving.current) setEditorOpen(false)
        }}
        onOk={() => form.submit()}
        okText={editingUser ? '保存' : '新增'}
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
          onFinish={async (values: SharingUser) => {
            if (
              users.some(
                (user) =>
                  user.invitationCode !== editingUser?.invitationCode &&
                  (user.invitationCode === values.invitationCode ||
                    user.folderSharingCode === values.invitationCode),
              )
            ) {
              setError('邀请码已存在，请重新生成')
              return
            }
            const next = editingUser
              ? users.map((user) =>
                  user.invitationCode === editingUser.invitationCode
                    ? {
                        ...user,
                        ...values,
                        // 权限继续使用首次邀请码作为稳定键，换码不丢失共享范围。
                        folderSharingCode:
                          user.folderSharingCode ?? user.invitationCode,
                      }
                    : user,
                )
              : [...users, values]
            if (await save(next)) setEditorOpen(false)
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
          <Form.Item
            label="邀请码"
            required
            extra={
              editingUser
                ? '保存新邀请码后，旧邀请码和旧连接立即失效，原有共享文件夹权限保留。'
                : undefined
            }
          >
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
                  form.setFieldValue('invitationCode', generateCode())
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
