import { useEffect, useState } from 'react'
import { hc } from 'hono/client'
import { Button, Spin, message } from 'antd'
import { RocketOutlined, LockOutlined } from '@ant-design/icons'
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
        json: { enable: checked }
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
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex items-center justify-center min-h-[200px]">
        <Spin size="large" />
      </div>
    )
  }

  return (
    <>
      <div
        className={`bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col transition-all hover:shadow-md ${isLoggedIn ? 'cursor-pointer' : ''}`}
        onClick={handleCardClick}
      >
        <div className="p-5 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
          <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600 flex items-center justify-center">
            <RocketOutlined className="text-xl" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 m-0">Wan 视频下载</h3>
        </div>

        <div className="p-5 flex-1 flex flex-col gap-4">
          {errorMsg && (
            <div className="text-red-500 text-sm px-2">{errorMsg}</div>
          )}

          {!isLoggedIn ? (
            <div className="flex flex-col items-center justify-center py-6 text-center gap-4 bg-slate-50 rounded-xl border border-slate-100 flex-1">
              <div className="w-12 h-12 bg-slate-200/50 rounded-full flex items-center justify-center text-slate-400">
                <LockOutlined className="text-2xl" />
              </div>
              <div>
                <p className="text-slate-600 font-medium mb-1">未登录</p>
                <p className="text-slate-400 text-sm">请先登录以继续操作</p>
              </div>
              <div onClick={(e) => e.stopPropagation()} className="mt-2">
                <Button
                  type="primary"
                  onClick={handleLogin}
                  loading={loading}
                  className="bg-indigo-600 hover:bg-indigo-700 shadow-sm px-8"
                  shape="round"
                >
                  登录
                </Button>
              </div>
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
