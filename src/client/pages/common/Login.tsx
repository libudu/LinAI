import { loginWithCode, useLoginAccess } from '@/client/service/auth'
import { Alert, Card, Input, Spin, Typography, theme, type InputRef } from 'antd'
import { useEffect, useRef, useState } from 'react'

const loginTarget = () => {
  const path = new URLSearchParams(location.search).get('returnTo') || '/'
  try {
    const url = new URL(path, location.origin)
    return path.startsWith('/') &&
      url.origin === location.origin &&
      !url.pathname.startsWith('/auth/')
      ? url.pathname + url.search + url.hash
      : '/'
  } catch {
    return '/'
  }
}

export function Login() {
  const { token } = theme.useToken()
  const inputRef = useRef<InputRef>(null)
  const submitting = useRef(false)
  const [code, setCode] = useState('')
  const [configured, setConfigured] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [lockedUntil, setLockedUntil] = useState(0)
  const [now, setNow] = useState(Date.now)
  const seconds = Math.max(0, Math.ceil((lockedUntil - now) / 1000))
  const disabled = !loaded || !configured || busy || seconds > 0

  useEffect(() => {
    let active = true
    const refresh = async () => {
      try {
        const status = await useLoginAccess.getState().fetchStatus()
        if (!active) return
        if (status.authenticated) {
          location.replace(loginTarget())
          return
        }
        setConfigured(status.configured)
        setNow(Date.now())
        setLockedUntil(
          status.retryAfter ? Date.now() + status.retryAfter * 1000 : 0,
        )
        setError(
          status.configured
            ? ''
            : '尚未配置登录验证码，请先在运行 LinAI 的电脑上通过 localhost 进入系统设置。',
        )
        setLoaded(true)
      } catch {
        if (!active) return
        setLoaded(false)
        setError('无法读取登录状态，请刷新重试')
      }
    }
    void refresh()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!lockedUntil) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [lockedUntil])

  useEffect(() => {
    if (lockedUntil && seconds === 0) {
      setLockedUntil(0)
      setError('')
    }
  }, [lockedUntil, seconds])

  useEffect(() => {
    if (!disabled) inputRef.current?.focus()
  }, [disabled])

  const submit = async (value: string) => {
    if (submitting.current || disabled || !/^\d{6}$/.test(value)) return
    submitting.current = true
    setBusy(true)
    setError('')
    try {
      const result = await loginWithCode(value)
      if (result.success) {
        location.replace(loginTarget())
        return
      }
      setNow(Date.now())
      setLockedUntil(
        result.retryAfter ? Date.now() + result.retryAfter * 1000 : 0,
      )
      setError(result.error.message)
    } catch {
      setError('无法连接服务，请重新输入验证码重试')
    } finally {
      setCode('')
      submitting.current = false
      setBusy(false)
    }
  }

  const displayedError =
    seconds > 0
      ? `验证码连续输入错误三次，请五分钟后再试（剩余 ${seconds} 秒）`
      : error

  return (
    <main
      style={{
        minHeight: '100dvh',
        boxSizing: 'border-box',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: token.colorBgLayout,
      }}
    >
      <Card style={{ width: '100%', maxWidth: 400 }}>
        <Typography.Title level={3} style={{ margin: '0 0 24px' }}>
          登录 LinAI
        </Typography.Title>
        <Input.Password
          ref={inputRef}
          value={code}
          size="large"
          placeholder="请输入登录验证码"
          aria-label="登录验证码"
          aria-describedby={displayedError ? 'login-error' : undefined}
          autoComplete="one-time-code"
          inputMode="numeric"
          maxLength={6}
          visibilityToggle={false}
          disabled={disabled}
          status={displayedError ? 'error' : undefined}
          suffix={busy ? <Spin size="small" /> : undefined}
          onChange={(event) => {
            const value = event.target.value.replace(/\D/g, '').slice(0, 6)
            setCode(value)
            if (value.length === 6) void submit(value)
          }}
        />
        {displayedError && (
          <div
            id="login-error"
            role="alert"
            aria-live="polite"
            style={{ marginTop: 16 }}
          >
            <Alert type="error" showIcon title={displayedError} />
          </div>
        )}
      </Card>
    </main>
  )
}
