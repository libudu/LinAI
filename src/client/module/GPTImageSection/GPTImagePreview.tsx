import { useState } from 'react'
import { PictureOutlined, AppstoreOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import { GPTImageModal } from './GPTImageModal'
import { GPTTokenModal } from './GPTTokenModal'
import { useGlobalStore } from '../../store/global'

export function GPTImagePreview() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false)
  const gptImageApiKey = useGlobalStore((state) => state.gptImageApiKey)
  const hasApiKey = !!gptImageApiKey

  const handleCardClick = () => {
    if (hasApiKey) {
      setIsModalOpen(true)
    } else {
      setIsTokenModalOpen(true)
    }
  }

  return (
    <>
      <div
        className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col transition-all hover:shadow-md cursor-pointer hover:border-purple-200"
        onClick={handleCardClick}
      >
        <div className="p-5 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
          <div className="p-2 bg-purple-100 rounded-lg text-purple-600">
            <AppstoreOutlined className="text-xl" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 m-0">GPT 图片生成</h3>
        </div>

        <div className="p-5 flex-1 flex flex-col gap-4">
          <div className="flex flex-col items-center justify-center py-6 text-center gap-4 bg-slate-50 rounded-xl border border-slate-100 flex-1">
            <div className="w-12 h-12 bg-purple-50 rounded-full flex items-center justify-center text-purple-400">
              <PictureOutlined className="text-2xl" />
            </div>
            <div>
              <p className="text-slate-600 font-medium mb-1">GPT-Image-2</p>
              <p className="text-slate-400 text-sm">使用 t8star API 生成图片</p>
            </div>
            <div
              onClick={(e) => e.stopPropagation()}
              className="mt-2 flex gap-2"
            >
              {!hasApiKey ? (
                <Button
                  type="primary"
                  onClick={() => setIsTokenModalOpen(true)}
                  className="bg-purple-600 hover:bg-purple-700 shadow-sm px-6"
                  shape="round"
                >
                  填写 API Key
                </Button>
              ) : (
                <>
                  <Button
                    type="default"
                    onClick={() => setIsTokenModalOpen(true)}
                    className="border-purple-200 text-purple-600 hover:text-purple-500 hover:border-purple-300 px-4"
                    shape="round"
                  >
                    编辑 API Key
                  </Button>
                  <Button
                    type="primary"
                    onClick={() => setIsModalOpen(true)}
                    className="bg-purple-600 hover:bg-purple-700 shadow-sm px-6"
                    shape="round"
                  >
                    打开配置
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <GPTImageModal open={isModalOpen} onClose={() => setIsModalOpen(false)} />
      <GPTTokenModal
        open={isTokenModalOpen}
        onClose={() => setIsTokenModalOpen(false)}
      />
    </>
  )
}
