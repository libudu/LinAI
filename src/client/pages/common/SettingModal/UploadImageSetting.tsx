import { Button, message, Switch } from 'antd'
import { hc } from 'hono/client'
import { forwardRef } from 'react'
import type { AppType } from '../../../../server'
import { useLocalSetting } from '../../../hooks/useLocalSetting'

const client = hc<AppType>('/')

export const UploadImageSetting = forwardRef((_props, _ref) => {
  const { gptImageSettings, setGptImageSettings } = useLocalSetting()

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

  const handleOpenGeneratedDir = async () => {
    try {
      const response =
        await client.api.static.images.generated['open-dir'].$post()
      const data = await response.json()
      if (!data.success) {
        message.error(data.error || '打开输出图片目录失败')
      }
    } catch (error: any) {
      message.error(error.message || '请求失败')
    }
  }

  return (
    <div className="px-4 py-2">
      <div className="flex gap-8">
        <div>
          <div className="mb-2 text-sm text-gray-500">输入图片目录</div>
          <Button onClick={handleOpenDir}>打开输入图片目录</Button>
        </div>
        <div>
          <div className="mb-2 text-sm text-gray-500">输出图片目录</div>
          <Button onClick={handleOpenGeneratedDir}>打开输出图片目录</Button>
        </div>
      </div>
      <div className="mt-6 flex gap-8">
        <div>
          <div className="mb-3 text-sm text-gray-500">删除任务</div>
          <div className="flex items-center gap-2">
            <Switch
              checked={gptImageSettings.keepImageWhenDeleteTask}
              onChange={(checked) =>
                setGptImageSettings((prev) => ({
                  ...prev,
                  keepImageWhenDeleteTask: checked,
                }))
              }
            />
            <span>删除任务时不删除图片</span>
          </div>
        </div>
        <div>
          <div className="mb-3 text-sm text-gray-500">任务列表</div>
          <div className="flex items-center gap-2">
            <Switch
              checked={gptImageSettings.showImageSizeInTaskList}
              onChange={(checked) =>
                setGptImageSettings((prev) => ({
                  ...prev,
                  showImageSizeInTaskList: checked,
                }))
              }
            />
            <span>显示图片尺寸</span>
          </div>
        </div>
      </div>
    </div>
  )
})
