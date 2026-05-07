import { LockOutlined } from '@ant-design/icons'
import { Button, Spin, message } from 'antd'
import { hc } from 'hono/client'
import { useEffect, useState } from 'react'
import type { AppType } from '../../../../../server/index'

const client = hc<AppType>('/')

export function WanPreview() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchStatus = async () => {
    try {
      const res = await client.api.wan.status.$get()
      const data = await res.json()
      setIsLoggedIn(data.isLoggedIn)
      setErrorMsg(data.errorMsg)
    } catch (e) {
      console.error(e)
      message.error('获取状态失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 10000)
    return () => clearInterval(interval)
  }, [])

  const handleLogin = async () => {
    setLoading(true)
    try {
      const res = await client.api.wan.login.$post()
      const data = await res.json()
      if (!data.success) {
        message.error(data.error || '登录失败')
      } else {
        message.success('登录成功')
      }
      await fetchStatus()
    } catch (e) {
      console.error(e)
      message.error('请求登录失败')
    }
    setLoading(false)
  }

  if (loading && !isLoggedIn) {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div className={`flex flex-col overflow-hidden transition-all`}>
      <div className="flex flex-1 flex-col gap-4">
        {errorMsg && (
          <div className="px-2 text-sm text-red-500">{errorMsg}</div>
        )}

        {!isLoggedIn ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-slate-100 bg-slate-50 py-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-200/50 text-slate-400">
              <LockOutlined className="text-2xl" />
            </div>
            <div>
              <p className="mb-1 font-medium text-slate-600">未登录</p>
              <p className="text-sm text-slate-400">请先登录以继续操作</p>
            </div>
            <div onClick={(e) => e.stopPropagation()} className="mt-2">
              <Button
                type="primary"
                onClick={handleLogin}
                loading={loading}
                className="bg-indigo-600 px-8 shadow-sm hover:bg-indigo-700"
                shape="round"
              >
                登录
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-500"></div>
                <span className="font-medium text-emerald-700">
                  已登录，服务正常
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
