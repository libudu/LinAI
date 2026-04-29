import { LockOutlined, RocketOutlined } from '@ant-design/icons'
import { Button, Spin, message } from 'antd'
import { hc } from 'hono/client'
import { useEffect, useState } from 'react'
import type { AppType } from '../../../server/index'
import { WanModal } from './WanModal'

const client = hc<AppType>('/')

export function WanPreview() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [autoSubmit, setAutoSubmit] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)

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

  const toggleAutoSubmit = async (checked: boolean) => {
    setAutoSubmit(checked)
    try {
      const res = await client.api.wan['auto-submit'].$post({
        json: { enable: checked },
      })
      const data = await res.json()
      if (!data.success) {
        message.error('切换自动提交失败')
        setAutoSubmit(!checked)
      }
      await fetchStatus()
    } catch (err) {
      console.error(err)
      message.error('请求失败')
      setAutoSubmit(!checked)
    }
  }

  const handleCardClick = () => {
    if (isLoggedIn) {
      setIsModalOpen(true)
    }
  }

  if (loading && !isLoggedIn) {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <Spin size="large" />
      </div>
    )
  }

  return (
    <>
      <div
        className={`flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:shadow-md ${isLoggedIn ? 'cursor-pointer' : ''}`}
        onClick={handleCardClick}
      >
        <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/50 p-5">
          <div className="flex items-center justify-center rounded-lg bg-indigo-100 p-2 text-indigo-600">
            <RocketOutlined className="text-xl" />
          </div>
          <h3 className="m-0 text-lg font-bold text-slate-800">Wan 视频下载</h3>
        </div>

        <div className="flex flex-1 flex-col gap-4 p-5">
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

      <WanModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        autoSubmit={autoSubmit}
        onToggleAutoSubmit={toggleAutoSubmit}
      />
    </>
  )
}
