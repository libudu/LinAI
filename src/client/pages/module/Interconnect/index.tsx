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
import { useNavigate } from 'react-router-dom'
import { useEagleConfig } from '../Eagle/settings/useEagleConfig'
import { ensureEagleOwnerSession } from '../Eagle/sharing/access'
import { DownloadLogButton } from '../Eagle/sharing/DownloadLogButton'
import {
  createRoom,
  deleteMember,
  deleteMemberHistory,
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
  const navigate = useNavigate()
  const [status, setStatus] = useState<RoomStatus | null>(null)
  const [entryMode, setEntryMode] = useState<'create' | 'join'>('create')
  const [groupsOpen, setGroupsOpen] = useState(false)
  const [connectLibraryOpen, setConnectLibraryOpen] = useState(false)
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
  const connectLibrary = () =>
    act(async () => {
      await selectRemoteLibrary()
      await useEagleConfig.getState().fetchEagleConfig()
      setConnectLibraryOpen(false)
      message.success('已切换为房主的远程资源库')
      navigate('/eagle')
    })
  const permissionGroups = (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-end gap-3">
        {room?.role === 'host' && (
          <h3 className="m-0 mr-auto flex items-center gap-2 font-medium text-slate-800">
            <TeamOutlined className="app-accent-text" />
            邀请
          </h3>
        )}
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
        scroll={{ x: 650 }}
        expandable={{
          rowExpandable: (entry) => entry.history.length > 0,
          expandedRowRender: (entry) => (
            <Table
              rowKey="id"
              size="small"
              pagination={{
                pageSize: 10,
                showSizeChanger: false,
                hideOnSinglePage: true,
              }}
              dataSource={entry.history}
              scroll={{ x: 680 }}
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
                  width: 120,
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
                  render: (value: number) => new Date(value).toLocaleString(),
                },
                {
                  title: '操作',
                  width: 130,
                  render: (_, user) => (
                    <Space size={4}>
                      <DownloadLogButton
                        groupId={entry.id}
                        userId={user.id}
                        name={user.name}
                      />
                      <Popconfirm
                        title="删除这条连接记录？"
                        description="用户下次重新连接时会再次记录。"
                        disabled={busy}
                        onConfirm={() =>
                          act(() => deleteMemberHistory(entry.id, user.id))
                        }
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
          ),
        }}
        columns={[
          { title: '名称', dataIndex: 'name', ellipsis: true },
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
                  onClick={() => setMember({ id: entry.id, name: entry.name })}
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
                    撤销授权
                  </Button>
                )}
                <Popconfirm
                  title="删除此权限组并撤销共享授权？已有文件夹授权记录会保留。"
                  onConfirm={() =>
                    act(async () => {
                      await deleteMember(entry.id)
                      setIssued(null)
                    })
                  }
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
    </>
  )
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
                <h2 className="m-0 min-w-0 text-lg font-semibold break-words text-slate-800">
                  {room.name}
                </h2>
                {room.memberName && (
                  <div className="mt-2 flex items-center gap-2 text-slate-500">
                    <UserOutlined className="shrink-0" />
                    <span className="min-w-0 break-words">
                      {room.memberName}
                    </span>
                    <Tag
                      className="!m-0 shrink-0"
                      bordered={false}
                      style={{
                        color: token.colorPrimaryText,
                        background: token.colorPrimaryBg,
                      }}
                    >
                      {room.role === 'host' ? '房主' : '成员'}
                    </Tag>
                  </div>
                )}
              </div>
              <Space wrap>
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
            {(room.role === 'guest' || room.state === 'error') && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-slate-50 px-3 py-2.5">
                <Badge
                  status={
                    room.state === 'connected'
                      ? 'success'
                      : room.state === 'error' || room.state === 'revoked'
                        ? 'error'
                        : 'default'
                  }
                  text={
                    room.state === 'connected'
                      ? '已连接房主'
                      : room.state === 'revoked'
                        ? '共享授权已撤销'
                        : room.state === 'error'
                          ? '核心已退出'
                          : room.memberError
                            ? '成员登记失败'
                            : '连接中'
                  }
                />
                {room.role === 'guest' && (
                  <ConnectionTag mode={room.connection} />
                )}
              </div>
            )}
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
            {room.role === 'guest' && (room.error || room.memberError) && (
              <details className="rounded-lg border border-slate-200 p-3 text-sm text-slate-500">
                <summary className="cursor-pointer">连接诊断</summary>
                <div className="mt-3 space-y-3">
                  <p className="m-0">
                    握手超时或连接关闭可能来自不可达的地址、网络限制或服务器不兼容；转发超时表示尚未成功访问房主服务，单条日志无法确定原因。
                  </p>
                  <p className="m-0">
                    跨网络连接需要双方能够访问同一个 EasyTier
                    公共节点，无法直连时还需要节点允许中转。房主更换连接服务器后，需要关闭并重新创建房间、发送新邀请；加入方修改本机服务器设置不会更改当前邀请。
                  </p>
                  <div>
                    <div className="mb-1">邀请中的连接地址</div>
                    <div className="font-mono break-all whitespace-pre-wrap">
                      {room.peers.join('\n')}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1">
                      最近 30 秒的核心诊断（已隐藏密钥）
                    </div>
                    <pre className="m-0 max-h-48 overflow-auto rounded bg-slate-50 p-2 text-xs break-all whitespace-pre-wrap">
                      {room.diagnostics || '最近没有核心错误日志。'}
                    </pre>
                  </div>
                </div>
              </details>
            )}
          </div>
          {room.role === 'host' && (
            <div className="border-t border-slate-100 p-5 sm:p-6">
              {permissionGroups}
            </div>
          )}
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
                  {
                    title: '名称',
                    dataIndex: 'name',
                    ellipsis: true,
                    width: '50%',
                    render: (name: string, entry) => (
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate" title={name}>
                          {name}
                        </span>
                        <span className="shrink-0">
                          {entry.role === 'host' ? (
                            <Tag
                              className="!m-0"
                              bordered={false}
                              color="orange"
                            >
                              房主
                            </Tag>
                          ) : (
                            <ConnectionTag mode={entry.connection} />
                          )}
                        </span>
                      </div>
                    ),
                  },
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
                  房主开放内容
                </h3>
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
                    status?.eagle?.state === 'connecting'
                  }
                  onClick={() => setConnectLibraryOpen(true)}
                >
                  连接房主远程资源库
                </Button>
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
                    setGroupsOpen(false)
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
      {room?.role === 'host' && (
        <Modal
          title="房间邀请"
          open={issued !== null}
          onCancel={() => setIssued(null)}
          footer={[
            <Button key="close" onClick={() => setIssued(null)}>
              关闭
            </Button>,
            <Button
              key="copy"
              type="primary"
              icon={<CopyOutlined />}
              onClick={async () => {
                if (!issued) return
                if (await copy(issued.invitation)) message.success('邀请已复制')
                else message.error('复制失败，请手动选择邀请文本复制')
              }}
            >
              复制完整邀请
            </Button>,
          ]}
        >
          <p className="mt-0 mb-4 leading-relaxed">
            此邀请仅交给使用此权限组的成员；重新生成会撤销该权限组的旧共享授权并终止共享连接。
          </p>
          <p className="mb-4 leading-relaxed">
            普通模式下，撤销共享授权后成员仍可能留在房间网络中。如需彻底断开旧成员，请关闭并重新创建房间，再邀请其他成员。
          </p>
          <Input.TextArea
            rows={5}
            aria-label="完整房间邀请"
            value={issued?.invitation ?? ''}
            readOnly
          />
        </Modal>
      )}
      {room?.role === 'guest' && (
        <Modal
          title="连接房主远程资源库"
          open={connectLibraryOpen}
          okText="确认连接"
          cancelText="取消"
          confirmLoading={busy}
          okButtonProps={{ disabled: !room.hostOnline }}
          closable={!busy}
          maskClosable={!busy}
          onOk={connectLibrary}
          onCancel={() => {
            if (!busy) setConnectLibraryOpen(false)
          }}
        >
          <p>
            将 Eagle
            图片管理模块中的资源库切换为房主的远程资源库，连接断开后将不可用，可在
            Eagle 图片管理模块中切换回本地资源库，是否确认？
          </p>
          {error && <Alert type="error" showIcon title={error} />}
        </Modal>
      )}
      {!room && (
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
          {permissionGroups}
        </Modal>
      )}
      {!room && (
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
      )}
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
    </div>
  )
}
