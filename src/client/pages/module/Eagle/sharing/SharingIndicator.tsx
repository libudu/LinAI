import { Button, Empty, Modal } from 'antd'
import { useState } from 'react'
import { formatFileSize } from '../components/formatFileSize'
import { useEagleConfig } from '../settings/useEagleConfig'
import { useEagleSharing } from './store'

export function SharingIndicator() {
  const remote = useEagleConfig((state) => state.libraryMode === 'remote')
  const { incoming, outgoing } = useEagleSharing()
  const active = incoming.filter((entry) => entry.state === 'approved')
  const [open, setOpen] = useState(false)
  return (
    <>
      {remote && outgoing?.state === 'approved' && (
        <span className="text-sm text-blue-500">使用远程资源库</span>
      )}
      {active.length > 0 && (
        <Button onClick={() => setOpen(true)}>远程共享中</Button>
      )}
      <Modal
        title="Eagle 数据共享"
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
      >
        {active.length === 0 ? (
          <Empty description="当前没有共享连接" />
        ) : (
          active.map((entry) => (
            <div
              key={entry.id}
              className="space-y-2 border-b border-slate-200 py-3"
            >
              <div>
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
