import { Button, Empty, Modal } from 'antd'
import { useState } from 'react'
import { formatFileSize } from '../components/formatFileSize'
import { useEagleConfig } from '../settings/useEagleConfig'
import { useEagleSharing } from './store'

export function SharingIndicator() {
  const remote = useEagleConfig((state) => state.libraryMode === 'remote')
  const { incoming, outgoing } = useEagleSharing()
  const active = incoming.filter((entry) => entry.state === 'approved')
  const remoteConnection =
    remote && outgoing?.state === 'approved' ? outgoing : null
  const [view, setView] = useState<'remote' | 'sharing' | null>(null)
  const hasConnection =
    view === 'remote' ? Boolean(remoteConnection) : active.length > 0
  return (
    <>
      {remoteConnection && (
        <Button onClick={() => setView('remote')}>使用远程资源库</Button>
      )}
      {active.length > 0 && (
        <Button onClick={() => setView('sharing')}>远程共享中</Button>
      )}
      <Modal
        title="Eagle 数据共享"
        open={view !== null}
        onCancel={() => setView(null)}
        footer={null}
      >
        {!hasConnection ? (
          <Empty description="当前没有共享连接" />
        ) : view === 'remote' ? (
          <div className="space-y-2 py-3">
            <div className="text-sm text-slate-500">
              传输速度：
              {formatFileSize(
                Math.round(remoteConnection?.bytesPerSecond ?? 0),
              )}
              /s
            </div>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无任务（尚未开放下载到本地）"
            />
          </div>
        ) : (
          active.map((entry) => (
            <div
              key={entry.id}
              className="space-y-2 border-b border-slate-200 py-3"
            >
              <div className="break-all">
                {entry.name}（{entry.invitationCode}）
              </div>
              <div className="text-sm text-slate-500">
                传输速度：{formatFileSize(Math.round(entry.bytesPerSecond))}/s ·
                已传输：{formatFileSize(entry.bytes)}
              </div>
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无任务（尚未开放下载到本地）"
              />
            </div>
          ))
        )}
      </Modal>
    </>
  )
}
