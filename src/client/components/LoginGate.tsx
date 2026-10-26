import { redirectToLogin, useLoginAccess } from '@/client/service/auth'
import { subscribeStorageEvent } from '@/client/service/storage-events'
import { Alert, Button, Spin } from 'antd'
import { useEffect, useState, type ReactNode } from 'react'

/** 应用组件挂载前先确认登录，避免加载未授权页面、配置或业务数据。 */
export function LoginGate({ children }: { children: ReactNode }) {
  const status = useLoginAccess((state) => state.status)
  const fetchStatus = useLoginAccess((state) => state.fetchStatus)
  const [error, setError] = useState('')
  const refresh = () => {
    setError('')
    void fetchStatus().catch((error) =>
      setError(error instanceof Error ? error.message : '连接服务失败'),
    )
  }
  useEffect(() => {
    refresh()
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pageshow', refresh)
    }
  }, [fetchStatus])
  useEffect(() => {
    if (status && !status.authenticated) {
      redirectToLogin()
      return
    }
    if (!status?.authenticated) return
    const unsubscribe = subscribeStorageEvent('settings.system', refresh)
    const timer = setInterval(refresh, 30000)
    return () => {
      unsubscribe()
      clearInterval(timer)
    }
  }, [status?.authenticated])
  useEffect(() => {
    if (!status?.expiresAt) return
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      const remaining = status.expiresAt! - Date.now()
      if (remaining <= 0) redirectToLogin()
      else timer = setTimeout(schedule, Math.min(remaining, 2147483647))
    }
    schedule()
    return () => clearTimeout(timer)
  }, [status?.expiresAt])
  if (error)
    return (
      <div className="mx-auto max-w-md space-y-3 p-6">
        <Alert type="error" showIcon title={error} />
        <Button onClick={refresh}>重新连接</Button>
      </div>
    )
  if (!status?.authenticated)
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spin size="large" />
      </div>
    )
  return children
}
