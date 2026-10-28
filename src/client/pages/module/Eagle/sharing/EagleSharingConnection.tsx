import { useEffect } from 'react'
import { ensureEagleOwnerSession } from './access'
import type { SharingStatus } from './api'
import { useEagleSharing } from './store'

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
