import { GoogleOutlined, PictureOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import { useState } from 'react'
import { GeminiModal } from './GeminiModal'

export function GeminiPreview() {
  const [isModalOpen, setIsModalOpen] = useState(false)

  const handleCardClick = () => {
    setIsModalOpen(true)
  }

  return (
    <>
      <div
        className="flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:border-blue-200 hover:shadow-md"
        onClick={handleCardClick}
      >
        <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/50 p-5">
          <div className="rounded-lg bg-blue-100 p-2 text-blue-600">
            <GoogleOutlined className="text-xl" />
          </div>
          <h3 className="m-0 text-lg font-bold text-slate-800">Gemini</h3>
        </div>

        <div className="flex flex-1 flex-col gap-4 p-5">
          <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-slate-100 bg-slate-50 py-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-400">
              <PictureOutlined className="text-2xl" />
            </div>
            <div>
              <p className="mb-1 font-medium text-slate-600">图片生成</p>
              <p className="text-sm text-slate-400">使用 Gemini API 生成图片</p>
            </div>
            <div onClick={(e) => e.stopPropagation()} className="mt-2">
              <Button
                type="primary"
                onClick={() => setIsModalOpen(true)}
                className="bg-blue-600 px-6 shadow-sm hover:bg-blue-700"
                shape="round"
              >
                打开配置
              </Button>
            </div>
          </div>
        </div>
      </div>

      <GeminiModal open={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  )
}
