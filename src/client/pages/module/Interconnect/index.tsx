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
  Select,
  Space,
  Table,
  Tag,
  Typography,
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

export function Interconnect() {
  const [status, setStatus] = useState<RoomStatus | null>(null)
  const [name, setName] = useState('我的房间')
  const [invitation, setInvitation] = useState('')
  const [issued, setIssued] = useState<{
    invitation: string
    expiresAt: number
  } | null>(null)
  const [ttl, setTtl] = useState(24)
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
        if (active) setStatus(next)
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
      <div>
        <h1 className="text-xl font-semibold">远程互联</h1>
        <p className="mt-2 text-sm text-slate-500">
          通过 EasyTier
          建立一个私有房间。连接由后端保持，切换页面或刷新浏览器后仍然有效。
        </p>
      </div>
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
          }
        >
          <Space wrap>
            <Tag>{room.role === 'host' ? '房主' : '成员'}</Tag>
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
                ? '已有成员连接'
                : room.state === 'error'
                  ? '核心已退出'
                  : '等待连接'}
            </Tag>
          </Space>
          {room.error && (
            <Alert className="mt-3" type="warning" title={room.error} />
          )}
          {room.expiresAt && (
            <p className="mt-3 text-sm text-slate-500">
              凭据到期：{new Date(room.expiresAt).toLocaleString()}
            </p>
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
            <Form
              layout="vertical"
              onFinish={() => act(() => createRoom(name.trim()))}
            >
              <Form.Item label="房间名称">
                <Input
                  value={name}
                  maxLength={80}
                  onChange={(event) => setName(event.target.value)}
                />
              </Form.Item>
              <Button
                htmlType="submit"
                type="primary"
                loading={busy}
                disabled={!status || !name.trim()}
              >
                创建房间
              </Button>
            </Form>
          </Card>
          <Card title="加入房间">
            <Form
              layout="vertical"
              onFinish={() =>
                act(async () => {
                  await joinRoom(invitation)
                  setInvitation('')
                })
              }
            >
              <Form.Item label="粘贴房主发来的完整邀请">
                <Input.TextArea
                  rows={3}
                  value={invitation}
                  maxLength={16020}
                  onChange={(event) => setInvitation(event.target.value)}
                />
              </Form.Item>
              <Button
                htmlType="submit"
                type="primary"
                loading={busy}
                disabled={!status || !invitation.trim()}
              >
                加入房间
              </Button>
            </Form>
          </Card>
        </div>
      )}
      {room?.role !== 'guest' && (
        <Card
          title="人员"
          extra={
            <Button
              disabled={busy || !status}
              onClick={() => setMember({ name: '' })}
            >
              添加人员
            </Button>
          }
        >
          <p className="mb-4 text-sm text-slate-500">
            原 Eagle
            共享用户及文件夹授权已沿用。为每位人员单独复制邀请，加入房间后仍需明确批准
            Eagle 共享；文件夹范围在 <Link to="/eagle">Eagle 展示选项</Link>{' '}
            设置。
          </p>
          <div className="mb-3 flex items-center gap-2 text-sm">
            邀请有效期
            <Select
              value={ttl}
              onChange={setTtl}
              options={[
                { value: 1, label: '1 小时' },
                { value: 24, label: '24 小时' },
                { value: 168, label: '7 天' },
              ]}
            />
          </div>
          <Table<RoomStatus['members'][number]>
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={status?.members ?? []}
            loading={!status && !error}
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
                title: '操作',
                render: (_, entry) => (
                  <Space wrap size={0}>
                    <Button
                      type="link"
                      size="small"
                      disabled={busy || !room || room.state === 'error'}
                      onClick={() =>
                        act(async () => {
                          setIssued(await inviteMember(entry.id, ttl))
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
                      title="删除此人员并撤销连接？已有文件夹授权记录会保留。"
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
        </Card>
      )}
      <details className="rounded-lg border border-slate-200 p-4">
        <summary className="cursor-pointer">高级节点配置</summary>
        <div className="mt-3 space-y-3">
          <p className="text-sm text-slate-500">
            每行一个兼容 Secure Mode 的 EasyTier TCP / UDP
            共享节点。邀请自动携带节点信息；保存后用于下次创建房间。默认公共节点的可用性及中继策略由节点运营方决定。
          </p>
          <Input.TextArea
            rows={3}
            value={peers}
            onChange={(event) => setPeers(event.target.value)}
            disabled={busy}
          />
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
      </details>
      <p className="text-xs text-slate-500">
        默认 no-tun，仅转发 Eagle
        专用共享端口。不会安装系统服务、修改路由、DNS、系统代理或防火墙；受管网络可能需要管理员放行。退出或关闭房间后邀请和共享失效，重启
        LinAI 后需要重新建房。
      </p>
      <Modal
        open={member !== null}
        title={member?.id ? '修改人员名称' : '添加人员'}
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
          aria-label="人员名称"
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
          此邀请仅交给对应人员；重新生成会撤销该人员的旧邀请和共享连接。
        </p>
        <Input.TextArea rows={5} value={issued?.invitation ?? ''} readOnly />
        <p className="my-3 text-sm text-slate-500">
          到期：{issued ? new Date(issued.expiresAt).toLocaleString() : ''}
        </p>
        <Button
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
      <Typography.Text type="secondary" className="text-xs">
        EasyTier 以独立进程运行，采用
        LGPL-3.0；包内含版本、哈希、许可和构建说明，对应源码保存在项目的 release-resources/easytier 目录，获取方式见包内 SOURCES.md。
      </Typography.Text>
    </div>
  )
}
