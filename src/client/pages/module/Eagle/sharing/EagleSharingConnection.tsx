import { Alert, Empty } from 'antd'
import { useEffect } from 'react'
import { ensureEagleOwnerSession } from './access'
import type { SharingStatus } from './api'
import { useEagleSharing } from './store'

export function DownloadTasks() {
  const downloads = useEagleSharing((state) => state.downloads)
  const connectionId = useEagleSharing((state) => state.outgoing?.id)
  const tasks = downloads.filter((task) => task.connectionId === connectionId)
  if (!tasks.length)
    return (
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无下载任务" />
    )
  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <div key={task.id} className="space-y-2 border-b border-slate-200 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate" title={task.folder}>
              {task.folder}
            </span>
            <span className="shrink-0">
              已完成 {task.completed} · 剩余 {task.remaining}
            </span>
          </div>
          {task.error && <Alert type="error" showIcon title={task.error} />}
        </div>
      ))}
    </div>
  )
}

/** 在应用根挂载，持续同步 Eagle 共享连接与传输状态。 */
export function EagleSharingConnection() {
  useEffect(() => {
    let source: EventSource | null = null
    let stopped = false
    let authorized = false
    const clear = () => {
      useEagleSharing.setState({
        connected: false,
        incoming: [],
        outgoing: null,
        downloads: [],
      })
    }
    const open = () => {
      if (stopped || !authorized) return
      source = new EventSource('/api/eagle/sharing/events')
      source.addEventListener('status', (event) => {
        const status = JSON.parse((event as MessageEvent).data) as SharingStatus
        useEagleSharing.setState({ ...status, connected: true })
      })
      source.onerror = () => {
        clear()
        void ensureEagleOwnerSession(true).catch(console.error)
      }
    }
    const close = () => {
      source?.close()
      source = null
      clear()
    }
    // 页面只订阅状态；后台会话由房间管理，刷新和关闭页面不撤销授权。
    const resume = () => {
      if (!source) open()
    }
    void ensureEagleOwnerSession()
      .then(() => {
        authorized = true
        if (!stopped) open()
      })
      .catch(console.error)
    window.addEventListener('pagehide', close)
    window.addEventListener('pageshow', resume)
    return () => {
      stopped = true
      window.removeEventListener('pagehide', close)
      window.removeEventListener('pageshow', resume)
      close()
    }
  }, [])
  return null
}
