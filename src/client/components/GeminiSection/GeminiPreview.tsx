import { useState } from 'react'
import { GoogleOutlined, PictureOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import { GeminiModal } from './GeminiModal'

export function GeminiPreview() {
  const [isModalOpen, setIsModalOpen] = useState(false)

  const handleCardClick = () => {
    setIsModalOpen(true)
  }

  return (
    <>
      <div
        className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col transition-all hover:shadow-md cursor-pointer hover:border-blue-200"
        onClick={handleCardClick}
      >
        <div className="p-5 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
          <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
            <GoogleOutlined className="text-xl" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 m-0">Gemini</h3>
        </div>

        <div className="p-5 flex-1 flex flex-col gap-4">
          <div className="flex flex-col items-center justify-center py-6 text-center gap-4 bg-slate-50 rounded-xl border border-slate-100 flex-1">
            <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center text-blue-400">
              <PictureOutlined className="text-2xl" />
            </div>
            <div>
              <p className="text-slate-600 font-medium mb-1">图片生成</p>
              <p className="text-slate-400 text-sm">使用 Gemini API 生成图片</p>
            </div>
            <div onClick={(e) => e.stopPropagation()} className="mt-2">
              <Button
                type="primary"
                onClick={() => setIsModalOpen(true)}
                className="bg-blue-600 hover:bg-blue-700 shadow-sm px-6"
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
