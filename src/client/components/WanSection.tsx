import { useEffect, useState } from 'react'
import { hc } from 'hono/client'
import { Typography, Alert, Button, Switch, Spin, message } from 'antd'
import { RocketOutlined } from '@ant-design/icons'
import type { AppType } from '../../server/index'

const client = hc<AppType>('/')

const { Title, Text } = Typography

export function WanSection() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [autoSubmit, setAutoSubmit] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchStatus = async () => {
    try {
      const res = await client.api.wan.status.$get()
      const data = await res.json()
      setIsLoggedIn(data.isLoggedIn)
      setAutoSubmit(data.autoSubmit)
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
    const interval = setInterval(fetchStatus, 5000)
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

  const toggleAutoSubmit = async (checked: boolean) => {
    setAutoSubmit(checked)
    try {
      const res = await client.api.wan['auto-submit'].$post({
        json: { enable: checked }
      })
      const data = await res.json()
      if (!data.success) {
        message.error('切换自动提交失败')
        setAutoSubmit(!checked)
      }
      await fetchStatus()
    } catch (e) {
      console.error(e)
      message.error('请求失败')
      setAutoSubmit(!checked)
    }
  }

  if (loading && !isLoggedIn) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex items-center justify-center min-h-[200px]">
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col transition-all hover:shadow-md">
      <div className="p-5 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
        <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
          <RocketOutlined className="text-xl" />
        </div>
        <h3 className="text-lg font-bold text-slate-800 m-0">Wan 视频下载</h3>
      </div>

      <div className="p-5 flex-1 flex flex-col gap-4">
        {errorMsg && (
          <Alert
            message="错误信息"
            description={errorMsg}
            type="error"
            showIcon
            className="rounded-xl border-red-200 bg-red-50"
          />
        )}

        {!isLoggedIn ? (
          <div className="flex flex-col items-center justify-center py-6 text-center gap-4 bg-slate-50 rounded-xl border border-slate-100 flex-1">
            <div className="w-12 h-12 bg-slate-200/50 rounded-full flex items-center justify-center text-slate-400">
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <div>
              <p className="text-slate-600 font-medium mb-1">未登录</p>
              <p className="text-slate-400 text-sm">请先登录以继续操作</p>
            </div>
            <Button
              type="primary"
              onClick={handleLogin}
              loading={loading}
              className="mt-2 bg-indigo-600 hover:bg-indigo-700 shadow-sm px-8"
              shape="round"
            >
              登录
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between p-4 bg-emerald-50/50 rounded-xl border border-emerald-100">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                <span className="text-emerald-700 font-medium">
                  已登录，服务正常
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100 mt-auto">
              <div className="flex flex-col pr-4">
                <Text strong className="text-sm text-slate-800">
                  自动提交任务
                </Text>
                <Text className="text-xs text-slate-500 mt-1">
                  开启后将自动轮询并提交新的下载任务
                </Text>
              </div>
              <Switch
                checked={autoSubmit}
                onChange={toggleAutoSubmit}
                className={autoSubmit ? 'bg-indigo-600' : 'bg-slate-300'}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
