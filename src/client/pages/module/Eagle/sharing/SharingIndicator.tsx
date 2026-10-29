import { SyncOutlined } from '@ant-design/icons'
import { Badge, Button, Empty, message, Modal, Pagination, theme } from 'antd'
import { useState } from 'react'
import { formatFileSize } from '../components/formatFileSize'
import { useEagleConfig } from '../settings/useEagleConfig'
import { DownloadTaskList } from './DownloadTaskList'
import { DownloadTasks } from './EagleSharingConnection'
import { disconnectIncomingConnection, disconnectRemoteLibrary } from './api'
import { useEagleSharing } from './store'

export function SharingIndicator() {
  const remote = useEagleConfig((state) => state.libraryMode === 'remote')
  const { token } = theme.useToken()
  const { incoming, outgoing, downloads } = useEagleSharing()
  const active = incoming.filter((entry) => entry.state === 'approved')
  const remoteConnection =
    remote && outgoing?.state === 'approved' ? outgoing : null
  const [view, setView] = useState<'remote' | 'sharing' | null>(null)
  const [page, setPage] = useState(1)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const pageSize = 5
  const current = Math.min(
    page,
    Math.max(1, Math.ceil(active.length / pageSize)),
  )
  const pending = downloads.filter(
    (task) =>
      task.connectionId === remoteConnection?.id &&
      (task.state === 'running' || task.state === 'queued'),
  )
  const remainingFolderCount = new Set(pending.map((task) => task.folderId))
    .size
  const hasConnection =
    view === 'remote' ? Boolean(remoteConnection) : active.length > 0
  const disconnect = async (id: string, direction: 'incoming' | 'outgoing') => {
    setDisconnecting(id)
    try {
      if (direction === 'incoming') {
        await disconnectIncomingConnection(id)
        useEagleSharing.setState((state) => ({
          incoming: state.incoming.filter((entry) => entry.id !== id),
        }))
      } else {
        await disconnectRemoteLibrary()
        useEagleSharing.setState((state) =>
          state.outgoing?.id === id ? { outgoing: null } : {},
        )
      }
      message.success('连接已断开')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '断开连接失败')
    } finally {
      setDisconnecting(null)
    }
  }
  return (
    <>
      {remoteConnection && (
        <Badge
          count={remainingFolderCount}
          title={`剩余 ${remainingFolderCount} 个文件夹待同步`}
          styles={{
            indicator: { background: token.colorPrimary, fontSize: 10 },
          }}
        >
          <Button
            color="primary"
            variant="outlined"
            icon={<SyncOutlined spin style={{ animationDuration: '3s' }} />}
            onClick={() => setView('remote')}
          >
            远程连接中
          </Button>
        </Badge>
      )}
      {active.length > 0 && (
        <Button
          color="primary"
          variant="outlined"
          icon={<SyncOutlined spin style={{ animationDuration: '3s' }} />}
          onClick={() => setView('sharing')}
        >
          远程共享中
        </Button>
      )}
      <Modal
        title="Eagle 数据共享"
        open={view !== null}
        onCancel={() => setView(null)}
        footer={null}
        width={640}
      >
        {hasConnection && (
          <div className="mb-3 text-sm text-slate-500">
            LinAI 后台运行期间，关闭网页仍会保持连接。断开连接会停止此连接的传输。
          </div>
        )}
        {!hasConnection ? (
          <Empty description="当前没有共享连接" />
        ) : view === 'remote' ? (
          <div className="space-y-2 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 break-all">{remoteConnection?.url}</div>
              <Button
                danger
                disabled={disconnecting !== null}
                loading={disconnecting === remoteConnection?.id}
                onClick={() => {
                  if (remoteConnection)
                    void disconnect(remoteConnection.id, 'outgoing')
                }}
              >
                断开连接
              </Button>
            </div>
            <div className="text-sm text-slate-500">
              传输速度：
              {formatFileSize(
                Math.round(remoteConnection?.bytesPerSecond ?? 0),
              )}
              /s
            </div>
            <DownloadTasks />
          </div>
        ) : (
          <div>
            <div className="divide-y divide-slate-200">
              {active
                .slice((current - 1) * pageSize, current * pageSize)
                .map((entry) => (
                  <div key={entry.id} className="space-y-1 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 break-all">
                        {entry.memberName ?? entry.name}（
                        {entry.memberName ? entry.name : entry.invitationCode}）
                      </div>
                      <Button
                        danger
                        size="small"
                        disabled={disconnecting !== null}
                        loading={disconnecting === entry.id}
                        onClick={() => void disconnect(entry.id, 'incoming')}
                      >
                        断开连接
                      </Button>
                    </div>
                    <div className="text-sm text-slate-500">
                      传输速度：
                      {formatFileSize(Math.round(entry.bytesPerSecond))}
                      /s · 已传输：{formatFileSize(entry.bytes)}
                    </div>
                    {entry.downloads.length > 0 && (
                      <DownloadTaskList
                        key={entry.id}
                        tasks={entry.downloads}
                      />
                    )}
                  </div>
                ))}
            </div>
            {active.length > pageSize && (
              <Pagination
                className="mt-3"
                size="small"
                current={current}
                pageSize={pageSize}
                total={active.length}
                showSizeChanger={false}
                onChange={setPage}
              />
            )}
          </div>
        )}
      </Modal>
    </>
  )
}
