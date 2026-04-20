import { useState } from 'react'
import { hc } from 'hono/client'
import { Modal, Button, message, Divider } from 'antd'
import { CodeOutlined } from '@ant-design/icons'
import type { AppType } from '../../server/index'
import { LogViewer } from './LogViewer'

const client = hc<AppType>('/')

export function TraeSection() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const showModal = () => {
    setIsModalOpen(true)
  }

  const handleCancel = () => {
    setIsModalOpen(false)
  }

  const handleApplyEmail = async () => {
    setLoading(true)
    try {
      const res = await client.api.trae['apply-email'].$post()
      const data = await res.json()
      if (!data.success) {
        message.error('error' in data ? data.error : '申请失败')
      } else {
        message.success('成功触发 Trae 功能')
      }
    } catch (e) {
      console.error(e)
      message.error('请求申请失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div
        className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col transition-all hover:shadow-md cursor-pointer hover:border-indigo-200"
        onClick={showModal}
      >
        <div className="p-5 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
          <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
            <CodeOutlined className="text-xl" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 m-0">Trae</h3>
        </div>

        <div className="p-5 flex-1 flex flex-col gap-4">
          <div className="flex flex-col items-center justify-center py-6 text-center gap-4 bg-slate-50 rounded-xl border border-slate-100 flex-1">
            <div>
              <p className="text-slate-600 font-medium mb-1">Trae 功能体验</p>
              <p className="text-slate-400 text-sm">点击探索更多</p>
            </div>
          </div>
        </div>
      </div>

      <Modal
        title="Trae 功能"
        open={isModalOpen}
        onCancel={handleCancel}
        footer={null}
        centered
        width={800}
      >
        <div className="flex flex-col py-4">
          <div className="flex flex-col items-center justify-center gap-4">
            <p className="text-slate-600 text-center">
              申请临时邮箱账号，并使用 Playwright 自动打开 Trae 官网
            </p>
            <Button
              type="primary"
              onClick={handleApplyEmail}
              loading={loading}
              className="bg-indigo-600 hover:bg-indigo-700 shadow-sm px-8"
              shape="round"
              size="large"
            >
              申请临时邮箱账号
            </Button>
          </div>

          <Divider className="my-0" />
          <LogViewer moduleId="trae" title="Trae 自动化日志" />
        </div>
      </Modal>
    </>
  )
}
