import { message, Modal } from 'antd'
import { useEffect } from 'react'
import { DownloadTaskList } from './DownloadTaskList'
import { ensureEagleOwnerSession } from './access'
import { decideSharing, type SharingStatus } from './api'
import { useEagleSharing } from './store'

export function DownloadTasks() {
  const downloads = useEagleSharing((state) => state.downloads)
  const connectionId = useEagleSharing((state) => state.outgoing?.id)
  const tasks = downloads.filter((task) => task.connectionId === connectionId)
  return <DownloadTaskList key={connectionId} tasks={tasks} />
}

/** 在应用根挂载，持续同步 Eagle 共享连接与传输状态。 */
export function EagleSharingConnection() {
  useEffect(() => {
    const dialogs = new Map<string, ReturnType<typeof Modal.confirm>>()
    const dismissed = new Set<string>()
    let source: EventSource | null = null
    let stopped = false
    let authorized = false
    const clear = () => {
      for (const dialog of dialogs.values()) dialog.destroy()
      dialogs.clear()
      dismissed.clear()
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
        const pending = new Set(
          status.incoming
            .filter((entry) => entry.state === 'pending')
            .map((entry) => entry.id),
        )
        for (const [id, dialog] of dialogs) {
          if (!pending.has(id)) {
            dialog.destroy()
            dialogs.delete(id)
          }
        }
        for (const id of dismissed) {
          if (!pending.has(id)) dismissed.delete(id)
        }
        for (const entry of status.incoming) {
          if (entry.state !== 'pending' || dismissed.has(entry.id)) continue
          const content = `用户【${entry.memberName ?? entry.name}】通过【${entry.name}（${entry.invitationCode}）】请求共享 Eagle 资源库，是否同意？`
          const dialog = dialogs.get(entry.id)
          if (dialog) {
            dialog.update({ content })
            continue
          }
          dialogs.set(
            entry.id,
            Modal.confirm({
              title: 'Eagle 数据共享',
              content,
              okText: '同意',
              cancelText: '拒绝',
              centered: true,
              maskClosable: false,
              onOk: async () => {
                try {
                  await decideSharing(entry.id, true)
                  dismissed.add(entry.id)
                } catch (error) {
                  message.error(
                    error instanceof Error ? error.message : '处理请求失败',
                  )
                  throw error
                }
              },
              onCancel: async () => {
                try {
                  await decideSharing(entry.id, false)
                  dismissed.add(entry.id)
                } catch (error) {
                  message.error(
                    error instanceof Error ? error.message : '拒绝请求失败',
                  )
                  throw error
                }
              },
            }),
          )
        }
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
    // 页面接收审批请求和传输状态；已建立的连接与后台下载不受页面刷新影响。
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
