import { Button, message, Modal } from 'antd'
import { hc } from 'hono/client'
import { forwardRef } from 'react'
import type { AppType } from '../../../server'

const client = hc<AppType>('/')

export const UploadImageSetting = forwardRef((_props, _ref) => {
  const handleOpenDir = async () => {
    try {
      const response = await client.api.static.images.input['open-dir'].$post()
      const data = await response.json()
      if (!data.success) {
        message.error(data.error || '打开目录失败')
      }
    } catch (error: any) {
      message.error(error.message || '请求失败')
    }
  }

  const handleClearUnreferenced = () => {
    Modal.confirm({
      title: '清理无引用图片',
      content:
        '运行后将清除输入图片目录下所有没有模板引用的文件，可能导致文件丢失。确定要继续吗？',
      okText: '确定',
      cancelText: '取消',
      onOk: async () => {
        try {
          const response =
            await client.api.static.images.input['clear-unreferenced'].$post()
          const data = await response.json()
          if (data.success) {
            message.success(`清理完成，共删除了 ${data.deletedCount} 个文件`)
          } else {
            message.error(data.error || '清理失败')
          }
        } catch (error: any) {
          message.error(error.message || '请求失败')
        }
      },
    })
  }

  return (
    <div className="px-4 py-2">
      <div className="flex gap-8">
        <div>
          <div className="mb-2 text-sm text-gray-500">目录操作</div>
          <Button onClick={handleOpenDir}>打开输入图片目录</Button>
        </div>
        <div>
          <div className="mb-2 text-sm text-gray-500">空间清理</div>
          <Button danger onClick={handleClearUnreferenced}>
            清除无引用图片
          </Button>
        </div>
      </div>
    </div>
  )
})
