import { message, Modal } from 'antd'
import { useEffect } from 'react'
import { ensureEagleOwnerSession } from './access'
import { decideSharing, type SharingStatus } from './api'
import { useEagleSharing } from './store'

/** 在应用根挂载，浏览任意模块时都能收到 Eagle 共享请求。 */
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
        for (const entry of status.incoming) {
          const content = `房间人员【${entry.name}】请求只读浏览 Eagle 资源库。仅开放你在文件夹可见性中授权的范围，是否同意？`
          const dialog = dialogs.get(entry.id)
          if (dialog) {
            dialog.update({ content })
            continue
          }
          if (entry.state !== 'pending' || dismissed.has(entry.id)) continue
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
                dismissed.add(entry.id)
                try {
                  await decideSharing(entry.id, false)
                } catch (error) {
                  message.error(
                    error instanceof Error ? error.message : '拒绝请求失败',
                  )
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
