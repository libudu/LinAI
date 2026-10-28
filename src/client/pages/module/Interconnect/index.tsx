import { settingsClient } from '@/client/service/settings'
import type { InterconnectSettings } from '@/server/module/interconnect/settings'
import {
  CopyOutlined,
  DownOutlined,
  FolderOpenOutlined,
  HomeOutlined,
  LoginOutlined,
  LogoutOutlined,
  PlusOutlined,
  SaveOutlined,
  SettingOutlined,
  SwapOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { useLocalStorageState } from 'ahooks'
import {
  Alert,
  Badge,
  Button,
  ConfigProvider,
  Form,
  Input,
  Modal,
  Popconfirm,
  Segmented,
  Space,
  Table,
  Tag,
  message,
  theme,
} from 'antd'
import copy from 'copy-to-clipboard'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useEagleConfig } from '../Eagle/settings/useEagleConfig'
import { ensureEagleOwnerSession } from '../Eagle/sharing/access'
import {
  createRoom,
  deleteMember,
  fetchRoomStatus,
  inviteMember,
  joinRoom,
  leaveRoom,
  revokeMember,
  saveMember,
  selectRemoteLibrary,
  type RoomStatus,
} from './api'

const settings = settingsClient<InterconnectSettings>('interconnect')

function ConnectionTag({
  mode,
}: {
  mode: NonNullable<RoomStatus['room']>['connection']
}) {
  if (mode === null) return null
  return (
    <Tag
      className="!m-0"
      bordered={false}
      icon={
        mode === 'direct' ? (
          <ThunderboltOutlined />
        ) : mode === 'relay' ? (
          <SwapOutlined />
        ) : undefined
      }
      color={
        mode === 'direct' ? 'green' : mode === 'relay' ? 'orange' : undefined
      }
    >
      {mode === 'direct'
        ? '直连'
        : mode === 'relay'
          ? '中转'
          : '连接方式待确认'}
    </Tag>
  )
}

export function Interconnect() {
  const { token } = theme.useToken()
  const [status, setStatus] = useState<RoomStatus | null>(null)
  const [entryMode, setEntryMode] = useState<'create' | 'join'>('create')
  const [groupsOpen, setGroupsOpen] = useState(false)
  const [name, setName] = useState('我的房间')
  const [savedMemberName, setMemberName] = useLocalStorageState<
    string | undefined
  >('interconnect_member_name', {
    deserializer: (raw) => {
      const value: unknown = JSON.parse(raw)
      return typeof value === 'string' ? value : undefined
    },
  })
  const memberName = savedMemberName ?? ''
  const memberNameInitialized = useRef(savedMemberName !== undefined)
  const [invitation, setInvitation] = useState('')
  const [issued, setIssued] = useState<{
    invitation: string
  } | null>(null)
  const [member, setMember] = useState<{ id?: string; name: string } | null>(
    null,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [peers, setPeers] = useState('')
  const [revision, setRevision] = useState<number | null>(null)
  const running = useRef(false)
  const room = status?.room
  const reload = useCallback(async () => {
    setStatus(await fetchRoomStatus())
  }, [])
  useEffect(() => {
    let active = true
    let loading = false
    const load = async () => {
      if (loading) return
      loading = true
      try {
        const next = await fetchRoomStatus()
        if (active) {
          setStatus(next)
          if (!memberNameInitialized.current) {
            memberNameInitialized.current = true
            setMemberName(next.memberName)
          }
        }
      } catch (error) {
        if (active)
          setError(error instanceof Error ? error.message : '读取房间失败')
      } finally {
        loading = false
      }
    }
    void load()
    void ensureEagleOwnerSession()
      .then(() => settings.get())
      .then((snapshot) => {
        if (active) {
          setPeers(snapshot.value.peers.join('\n'))
          setRevision(snapshot.revision)
        }
      })
      .catch((error) => {
        if (active)
          setError(error instanceof Error ? error.message : '读取节点设置失败')
      })
    const timer = window.setInterval(() => void load(), 3000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [setMemberName])
  const act = async (work: () => Promise<unknown>) => {
    if (running.current) return
    running.current = true
    setBusy(true)
    setError('')
    try {
      await work()
      await reload()
    } catch (error) {
      setError(error instanceof Error ? error.message : '操作失败')
    } finally {
      running.current = false
      setBusy(false)
    }
  }
  const requestLibrary = () =>
    act(async () => {
      await selectRemoteLibrary()
      await useEagleConfig.getState().fetchEagleConfig()
      message.success('已请求 Eagle 只读共享，等待房主同意')
    })
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {error && (
        <Alert
          type="error"
          showIcon
          title={error}
          closable
          onClose={() => setError('')}
        />
      )}
      {room ? (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="space-y-5 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="m-0 min-w-0 text-lg font-semibold break-words text-slate-800">
                    {room.name}
                  </h2>
                  <Tag
                    className="!m-0"
                    bordered={false}
                    style={{
                      color: token.colorPrimaryText,
                      background: token.colorPrimaryBg,
                    }}
                  >
                    {room.role === 'host' ? '房主' : '成员'}
                  </Tag>
                </div>
                {room.memberName && (
                  <div className="mt-2 flex items-center gap-2 text-slate-500">
                    <UserOutlined className="shrink-0" />
                    <span className="min-w-0 break-words">
                      {room.memberName}
                    </span>
                  </div>
                )}
              </div>
              <Space wrap>
                {room.role === 'host' && (
                  <Button
                    icon={<TeamOutlined />}
                    disabled={busy || !status}
                    onClick={() => setGroupsOpen(true)}
                  >
                    权限组
                  </Button>
                )}
                <Popconfirm
                  title={
                    room.role === 'host'
                      ? '关闭房间并撤销所有邀请和共享？'
                      : '退出当前房间？'
                  }
                  onConfirm={() =>
                    act(async () => {
                      await leaveRoom()
                      setIssued(null)
                    })
                  }
                >
                  <Button
                    type="text"
                    icon={<LogoutOutlined />}
                    danger
                    disabled={busy}
                  >
                    {room.role === 'host' ? '关闭房间' : '退出房间'}
                  </Button>
                </Popconfirm>
              </Space>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-slate-50 px-3 py-2.5">
              <Badge
                status={
                  room.state === 'connected'
                    ? 'success'
                    : room.state === 'error'
                      ? 'error'
                      : 'default'
                }
                text={
                  room.state === 'connected'
                    ? room.role === 'guest'
                      ? '已连接房主'
                      : '已有成员连接'
                    : room.state === 'error'
                      ? '核心已退出'
                      : '等待连接'
                }
              />
              {room.role === 'guest' && (
                <ConnectionTag mode={room.connection} />
              )}
            </div>
            {room.error && (
              <Alert
                type="warning"
                showIcon
                title={
                  <span className="break-all whitespace-pre-wrap">
                    {room.error}
                  </span>
                }
              />
            )}
            {room.memberError && (
              <Alert type="warning" showIcon title={room.memberError} />
            )}
          </div>
          {room.participants.length > 0 && (
            <div className="border-t border-slate-100 p-5 sm:p-6">
              <h3 className="m-0 mb-4 flex items-center gap-2 font-medium text-slate-800">
                <TeamOutlined className="app-accent-text" />
                房间成员
              </h3>
              <Table
                rowKey="address"
                size="small"
                pagination={false}
                dataSource={room.participants}
                columns={[
                  { title: '名称', dataIndex: 'name', ellipsis: true },
                  {
                    title: '虚拟 IP',
                    dataIndex: 'address',
                    width: 160,
                    render: (address: string) => (
                      <span className="font-mono text-slate-500">
                        {address}
                      </span>
                    ),
                  },
                ]}
              />
            </div>
          )}
          {room.role === 'guest' && (
            <div className="space-y-4 border-t border-slate-100 p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="m-0 flex items-center gap-2 font-medium text-slate-800">
                  <FolderOpenOutlined className="app-accent-text" />
                  房主资源库
                </h3>
                <Badge
                  status={
                    status?.eagle?.state === 'approved'
                      ? 'success'
                      : status?.eagle?.state === 'pending'
                        ? 'processing'
                        : 'default'
                  }
                  text={
                    status?.eagle?.state === 'approved'
                      ? '已授权，只读浏览'
                      : status?.eagle?.state === 'pending'
                        ? '等待房主同意'
                        : '尚未授权'
                  }
                />
              </div>
              {status?.eagle?.error && (
                <Alert type="warning" title={status.eagle.error} />
              )}
              <Space wrap size={12}>
                <Button
                  type="primary"
                  icon={<FolderOpenOutlined />}
                  disabled={
                    busy ||
                    !room.hostOnline ||
                    status?.eagle?.state === 'pending'
                  }
                  onClick={requestLibrary}
                >
                  请求 Eagle 资源库
                </Button>
                <Link
                  to="/eagle"
                  className="app-accent-text rounded-md px-2 py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-accent)]"
                >
                  打开 Eagle
                </Link>
              </Space>
            </div>
          )}
        </section>
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-7">
          <div className="mx-auto max-w-lg">
            <ConfigProvider
              theme={{
                components: {
                  Segmented: {
                    itemSelectedBg: token.colorPrimaryBg,
                    itemSelectedColor: token.colorPrimaryText,
                    trackPadding: 4,
                  },
                },
              }}
            >
              <Segmented
                block
                size="large"
                value={entryMode}
                disabled={busy}
                options={[
                  {
                    label: '创建房间',
                    value: 'create',
                    icon: <HomeOutlined />,
                  },
                  { label: '加入房间', value: 'join', icon: <LoginOutlined /> },
                ]}
                onChange={setEntryMode}
              />
            </ConfigProvider>
            <Form
              style={{ marginTop: 24 }}
              layout="vertical"
              requiredMark={false}
              onFinish={() =>
                act(async () => {
                  if (!status || !memberName.trim()) return
                  if (entryMode === 'create') {
                    if (!name.trim()) return
                    await createRoom(name.trim(), memberName.trim())
                  } else {
                    if (!invitation.trim()) return
                    await joinRoom(invitation, memberName.trim())
                    setInvitation('')
                  }
                })
              }
            >
              {entryMode === 'create' && (
                <Form.Item
                  label="房间名称"
                  required
                  style={{ marginBottom: 20 }}
                >
                  <Input
                    size="large"
                    prefix={<HomeOutlined className="mr-1 text-slate-400" />}
                    value={name}
                    maxLength={80}
                    aria-label="房间名称"
                    disabled={busy}
                    onChange={(event) => setName(event.target.value)}
                  />
                </Form.Item>
              )}
              <Form.Item label="你的名称" required style={{ marginBottom: 20 }}>
                <Input
                  size="large"
                  prefix={<UserOutlined className="mr-1 text-slate-400" />}
                  value={memberName}
                  maxLength={80}
                  aria-label="你的名称"
                  disabled={busy}
                  onChange={(event) => {
                    memberNameInitialized.current = true
                    setMemberName(event.target.value)
                  }}
                />
              </Form.Item>
              {entryMode === 'join' && (
                <Form.Item label="房间邀请" style={{ marginBottom: 20 }}>
                  <Input.TextArea
                    rows={4}
                    value={invitation}
                    maxLength={16020}
                    aria-label="房间邀请"
                    placeholder="粘贴房主发来的完整邀请"
                    disabled={busy}
                    onChange={(event) => setInvitation(event.target.value)}
                  />
                </Form.Item>
              )}
              <div className="flex gap-3 pt-1">
                {entryMode === 'create' && (
                  <Button
                    className="shrink-0"
                    size="large"
                    icon={<TeamOutlined />}
                    disabled={busy || !status}
                    onClick={() => setGroupsOpen(true)}
                  >
                    权限组
                  </Button>
                )}
                <Button
                  className="min-w-0 flex-1"
                  size="large"
                  htmlType="submit"
                  type="primary"
                  loading={busy}
                  disabled={
                    !status ||
                    !memberName.trim() ||
                    !(entryMode === 'create' ? name.trim() : invitation.trim())
                  }
                >
                  {entryMode === 'create' ? '创建房间' : '加入房间'}
                </Button>
              </div>
            </Form>
          </div>
        </section>
      )}
      {room?.role !== 'guest' && (
        <Modal
          title="编辑权限组"
          open={groupsOpen}
          width={900}
          footer={null}
          styles={{ body: { paddingTop: 20 } }}
          onCancel={() => {
            if (!busy) setGroupsOpen(false)
          }}
        >
          {error && (
            <Alert className="mb-3" type="error" showIcon title={error} />
          )}
          <div className="mb-5 flex justify-end">
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={busy || !status}
              onClick={() => setMember({ name: '' })}
            >
              添加权限组
            </Button>
          </div>
          <Table<RoomStatus['members'][number]>
            rowKey="id"
            size="middle"
            pagination={false}
            dataSource={status?.members ?? []}
            loading={!status && !error}
            scroll={{ x: 800 }}
            expandable={{
              rowExpandable: (entry) => entry.history.length > 0,
              expandedRowRender: (entry) => (
                <Table
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={entry.history}
                  scroll={{ x: 650 }}
                  columns={[
                    {
                      title: '名称',
                      dataIndex: 'name',
                      ellipsis: true,
                      width: 120,
                    },
                    {
                      title: '用户标识',
                      dataIndex: 'id',
                      ellipsis: true,
                      width: 240,
                    },
                    {
                      title: '虚拟 IP',
                      dataIndex: 'address',
                      width: 130,
                    },
                    {
                      title: '上次登录时间',
                      dataIndex: 'lastLoginAt',
                      width: 180,
                      render: (value: number) =>
                        new Date(value).toLocaleString(),
                    },
                  ]}
                />
              ),
            }}
            columns={[
              { title: '名称', dataIndex: 'name', ellipsis: true },
              {
                title: '状态',
                render: (_, entry) =>
                  entry.online ? (
                    <Tag className="!m-0" bordered={false} color="green">
                      在线
                      {entry.sharing === 'approved' ? ' · Eagle 共享中' : ''}
                    </Tag>
                  ) : entry.invited ? (
                    '已邀请'
                  ) : (
                    '未邀请'
                  ),
              },
              {
                title: '连接方式',
                render: (_, entry) =>
                  entry.online ? (
                    <ConnectionTag mode={entry.connection} />
                  ) : (
                    '—'
                  ),
              },
              {
                title: '操作',
                width: 300,
                render: (_, entry) => (
                  <Space wrap size={4}>
                    <Button
                      type="link"
                      size="small"
                      disabled={busy || !room || room.state === 'error'}
                      onClick={() =>
                        act(async () => {
                          setIssued(await inviteMember(entry.id))
                        })
                      }
                    >
                      生成邀请
                    </Button>
                    <Button
                      type="link"
                      size="small"
                      disabled={busy}
                      onClick={() =>
                        setMember({ id: entry.id, name: entry.name })
                      }
                    >
                      改名
                    </Button>
                    {entry.invited && (
                      <Button
                        type="link"
                        size="small"
                        danger
                        disabled={busy}
                        onClick={() =>
                          act(async () => {
                            await revokeMember(entry.id)
                            setIssued(null)
                          })
                        }
                      >
                        撤销
                      </Button>
                    )}
                    <Popconfirm
                      title="删除此权限组并撤销连接？已有文件夹授权记录会保留。"
                      onConfirm={() => act(() => deleteMember(entry.id))}
                    >
                      <Button type="link" size="small" danger disabled={busy}>
                        删除
                      </Button>
                    </Popconfirm>
                  </Space>
                ),
              },
            ]}
          />
        </Modal>
      )}
      <details className="group rounded-xl border border-slate-200 bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl px-5 py-4 font-medium text-slate-600 transition-colors hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-accent)] [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2">
            <SettingOutlined className="text-slate-400" />
            高级设置
          </span>
          <DownOutlined className="text-xs text-slate-400 transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-4 border-t border-slate-100 p-5 sm:p-6">
          <div className="space-y-2">
            <label className="block" htmlFor="interconnect-peers">
              连接服务器
            </label>
            <Input.TextArea
              id="interconnect-peers"
              rows={3}
              value={peers}
              onChange={(event) => setPeers(event.target.value)}
              disabled={busy || revision === null}
            />
          </div>
          <div className="flex justify-end">
            <Button
              icon={<SaveOutlined />}
              disabled={busy || revision === null}
              onClick={() =>
                act(async () => {
                  if (revision === null) return
                  const snapshot = await settings.put(
                    {
                      peers: peers
                        .split(/\r?\n/)
                        .map((peer) => peer.trim())
                        .filter(Boolean),
                    },
                    revision,
                  )
                  setPeers(snapshot.value.peers.join('\n'))
                  setRevision(snapshot.revision)
                  message.success('节点配置已保存')
                })
              }
            >
              保存节点配置
            </Button>
          </div>
        </div>
      </details>
      <Modal
        open={member !== null}
        title={member?.id ? '修改权限组名称' : '添加权限组'}
        okText="保存"
        cancelText="取消"
        confirmLoading={busy}
        styles={{ body: { paddingTop: 20, paddingBottom: 8 } }}
        onCancel={() => {
          if (!busy) setMember(null)
        }}
        okButtonProps={{ disabled: !member?.name.trim() }}
        onOk={() =>
          act(async () => {
            if (member) {
              await saveMember(member.name.trim(), member.id)
              setMember(null)
            }
          })
        }
      >
        <Input
          size="large"
          prefix={<TeamOutlined className="mr-1 text-slate-400" />}
          aria-label="权限组名称"
          value={member?.name ?? ''}
          maxLength={80}
          onChange={(event) =>
            setMember((current) =>
              current ? { ...current, name: event.target.value } : current,
            )
          }
        />
      </Modal>
      <Modal
        open={issued !== null}
        title="房间邀请"
        footer={null}
        styles={{ body: { paddingTop: 20 } }}
        onCancel={() => setIssued(null)}
      >
        <p className="mt-0 mb-4 leading-relaxed">
          此邀请仅交给使用此权限组的成员；重新生成会撤销该权限组的旧邀请和共享连接。
        </p>
        <Input.TextArea
          rows={5}
          aria-label="完整房间邀请"
          value={issued?.invitation ?? ''}
          readOnly
        />
        <div className="mt-5 flex justify-end">
          <Button
            type="primary"
            icon={<CopyOutlined />}
            onClick={async () => {
              if (!issued) return
              if (await copy(issued.invitation)) message.success('邀请已复制')
              else message.error('复制失败，请手动选择邀请文本复制')
            }}
          >
            复制完整邀请
          </Button>
        </div>
      </Modal>
    </div>
  )
}
