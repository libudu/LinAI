import { message, Modal } from 'antd'
import { useEffect } from 'react'
import { eaglePageId } from '../rpc'
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
      source = new EventSource(
        `/api/eagle/sharing/events?pageId=${eaglePageId}`,
      )
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
          if (
            entry.state !== 'pending' ||
            dialogs.has(entry.id) ||
            dismissed.has(entry.id)
          )
            continue
          dialogs.set(
            entry.id,
            Modal.confirm({
              title: 'Eagle 数据共享',
              content: `用户【${entry.name}（${entry.invitationCode}）】请求共享 Eagle 资源库，是否同意？`,
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
      navigator.sendBeacon(
        `/api/eagle/sharing/page/close?pageId=${eaglePageId}`,
      )
      clear()
    }
    // pagehide 可覆盖正常关闭、导航和 BFCache；恢复页面只重建在线状态，不恢复授权。
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
