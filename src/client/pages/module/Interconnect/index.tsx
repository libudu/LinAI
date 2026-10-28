import { settingsClient } from '@/client/service/settings'
import type { InterconnectSettings } from '@/server/module/interconnect/settings'
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  message,
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
  const [status, setStatus] = useState<RoomStatus | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [groupsOpen, setGroupsOpen] = useState(false)
  const [name, setName] = useState('我的房间')
  const [memberName, setMemberName] = useState('')
  const memberNameInitialized = useRef(false)
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
  }, [])
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
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
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
        <Card
          title={room.name}
          extra={
            <Space wrap>
              {room.role === 'host' && (
                <Button onClick={() => setGroupsOpen(true)}>编辑权限组</Button>
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
                <Button danger disabled={busy}>
                  {room.role === 'host' ? '关闭房间' : '退出房间'}
                </Button>
              </Popconfirm>
            </Space>
          }
        >
          <Space wrap>
            <Tag>{room.role === 'host' ? '房主' : '成员'}</Tag>
            {room.memberName && <Tag>名称：{room.memberName}</Tag>}
            <Tag
              color={
                room.state === 'connected'
                  ? 'green'
                  : room.state === 'error'
                    ? 'red'
                    : 'blue'
              }
            >
              {room.state === 'connected'
                ? room.role === 'guest'
                  ? '已连接房主'
                  : '已有成员连接'
                : room.state === 'error'
                  ? '核心已退出'
                  : '等待连接'}
            </Tag>
            {room.role === 'guest' && <ConnectionTag mode={room.connection} />}
          </Space>
          {room.error && (
            <Alert className="mt-3" type="warning" title={room.error} />
          )}
          {room.memberError && (
            <Alert
              className="mt-3"
              type="warning"
              title={`成员信息同步失败，将自动重试：${room.memberError}`}
            />
          )}
          {room.participants.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 text-sm font-medium">房间成员</div>
              <Table
                rowKey="address"
                size="small"
                pagination={false}
                dataSource={room.participants}
                columns={[
                  { title: '名称', dataIndex: 'name', ellipsis: true },
                  { title: '虚拟 IP', dataIndex: 'address' },
                ]}
              />
            </div>
          )}
          {room.role === 'guest' && (
            <div className="mt-4 space-y-3">
              <p>
                房主资源库：
                {status?.eagle?.state === 'approved'
                  ? '已授权，只读浏览'
                  : status?.eagle?.state === 'pending'
                    ? '等待房主同意'
                    : '尚未授权'}
              </p>
              {status?.eagle?.error && (
                <Alert type="warning" title={status.eagle.error} />
              )}
              <Space wrap>
                <Button
                  type="primary"
                  disabled={
                    busy ||
                    !room.hostOnline ||
                    status?.eagle?.state === 'pending'
                  }
                  onClick={requestLibrary}
                >
                  请求 Eagle 资源库
                </Button>
                <Link to="/eagle">打开 Eagle</Link>
              </Space>
            </div>
          )}
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card title="创建房间">
            <p className="mb-6">创建自己的房间，邀请其他成员加入。</p>
            <div className="flex flex-col items-start gap-3">
              <Button
                type="primary"
                disabled={busy || !status}
                onClick={() => setCreateOpen(true)}
              >
                创建房间
              </Button>
              <Button
                disabled={busy || !status}
                onClick={() => setGroupsOpen(true)}
              >
                编辑权限组
              </Button>
            </div>
          </Card>
          <Card title="加入房间">
            <Form
              layout="vertical"
              onFinish={() =>
                act(async () => {
                  await joinRoom(invitation, memberName.trim())
                  setInvitation('')
                })
              }
            >
              <Form.Item label="你的名称" required>
                <Input
                  value={memberName}
                  maxLength={80}
                  aria-label="你的名称"
                  onChange={(event) => {
                    memberNameInitialized.current = true
                    setMemberName(event.target.value)
                  }}
                />
              </Form.Item>
              <Form.Item label="粘贴房主发来的完整邀请">
                <Input.TextArea
                  rows={3}
                  value={invitation}
                  maxLength={16020}
                  onChange={(event) => setInvitation(event.target.value)}
                />
              </Form.Item>
              <div className="flex justify-end">
                <Button
                  htmlType="submit"
                  type="primary"
                  loading={busy}
                  disabled={!status || !invitation.trim() || !memberName.trim()}
                >
                  加入房间
                </Button>
              </div>
            </Form>
          </Card>
        </div>
      )}
      {room?.role !== 'guest' && (
        <Modal
          title="编辑权限组"
          open={groupsOpen}
          width={900}
          footer={null}
          onCancel={() => {
            if (!busy) setGroupsOpen(false)
          }}
        >
          {error && (
            <Alert className="mb-3" type="error" showIcon title={error} />
          )}
          <div className="mb-4 flex justify-end">
            <Button
              disabled={busy || !status}
              onClick={() => setMember({ name: '' })}
            >
              添加权限组
            </Button>
          </div>
          <Table<RoomStatus['members'][number]>
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={status?.members ?? []}
            loading={!status && !error}
            scroll={{ x: 650 }}
            expandable={{
              showExpandColumn: false,
              expandedRowKeys: (status?.members ?? [])
                .filter((entry) => entry.history.length > 0)
                .map((entry) => entry.id),
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
                    <Tag color="green">
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
                render: (_, entry) => (
                  <Space wrap size={0}>
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
      <details className="rounded-lg border border-slate-200 p-4">
        <summary className="cursor-pointer">高级设置</summary>
        <div className="mt-3 space-y-3">
          <label className="block" htmlFor="interconnect-peers">
            连接服务器
          </label>
          <Input.TextArea
            id="interconnect-peers"
            rows={3}
            value={peers}
            onChange={(event) => setPeers(event.target.value)}
            disabled={busy}
          />
          <div className="flex justify-end pt-2">
            <Button
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
        open={createOpen && !room}
        title="创建房间"
        okText="创建房间"
        cancelText="取消"
        confirmLoading={busy}
        onCancel={() => {
          if (!busy) setCreateOpen(false)
        }}
        okButtonProps={{
          disabled: !status || !name.trim() || !memberName.trim(),
          htmlType: 'submit',
          form: 'interconnect-create-room',
        }}
      >
        {error && (
          <Alert className="mb-3" type="error" showIcon title={error} />
        )}
        <Form
          id="interconnect-create-room"
          layout="vertical"
          onFinish={() =>
            act(async () => {
              if (!status || !name.trim() || !memberName.trim()) return
              await createRoom(name.trim(), memberName.trim())
              setCreateOpen(false)
            })
          }
        >
          <Form.Item label="房间名称" required>
            <Input
              value={name}
              maxLength={80}
              aria-label="房间名称"
              onChange={(event) => setName(event.target.value)}
            />
          </Form.Item>
          <Form.Item label="你的名称" required>
            <Input
              value={memberName}
              maxLength={80}
              aria-label="你的名称"
              onChange={(event) => {
                memberNameInitialized.current = true
                setMemberName(event.target.value)
              }}
            />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        open={member !== null}
        title={member?.id ? '修改权限组名称' : '添加权限组'}
        okText="保存"
        cancelText="取消"
        confirmLoading={busy}
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
        onCancel={() => setIssued(null)}
      >
        <p className="mb-3">
          此邀请仅交给使用此权限组的成员；重新生成会撤销该权限组的旧邀请和共享连接。
        </p>
        <Input.TextArea rows={5} value={issued?.invitation ?? ''} readOnly />
        <Button
          className="mt-3"
          type="primary"
          onClick={async () => {
            if (!issued) return
            if (await copy(issued.invitation)) message.success('邀请已复制')
            else message.error('复制失败，请手动选择邀请文本复制')
          }}
        >
          复制完整邀请
        </Button>
      </Modal>
    </div>
  )
}
