import { ExclamationCircleOutlined } from '@ant-design/icons'
import { Form, Input, Radio, Switch, message } from 'antd'
import { forwardRef, useEffect, useImperativeHandle } from 'react'
import { useGPTImageQuota } from '../../hooks/useGPTImageQuota'
import { useLocalSetting } from '../../hooks/useLocalSetting'
import { useGlobalStore } from '../../store/global'

export interface GPTImageSettingRef {
  save: () => Promise<string | undefined>
}

export const GPTImageSetting = forwardRef<GPTImageSettingRef>((_props, ref) => {
  const [form] = Form.useForm()
  const { gptImageApiKey, setGptImageApiKey } = useGlobalStore()
  const { gptImageSettings, setGptImageSettings } = useLocalSetting()
  const { isPublic } = useGPTImageQuota()

  useEffect(() => {
    form.setFieldsValue({
      apiKey: gptImageApiKey || '',
      enable1K: gptImageSettings.enable1K,
      enable2K: gptImageSettings.enable2K,
      enable4K: gptImageSettings.enable4K,
      quality: gptImageSettings.quality
    })
  }, [
    gptImageApiKey,
    gptImageSettings.enable1K,
    gptImageSettings.enable2K,
    gptImageSettings.enable4K,
    gptImageSettings.quality,
    form
  ])

  useImperativeHandle(ref, () => ({
    save: async () => {
      const values = await form.validateFields()
      if (!values.apiKey) {
        message.warning('请输入 API Key')
        throw new Error('No API Key')
      }
      await setGptImageApiKey(values.apiKey)
      setGptImageSettings({
        enable1K: values.enable1K,
        enable2K: values.enable2K,
        enable4K: values.enable4K,
        quality: values.quality
      })
      message.success('配置保存成功')
      return values.apiKey
    }
  }))

  return (
    <div className="px-4 py-2">
      <Form form={form} layout="vertical">
        <Form.Item
          name="apiKey"
          label="API Key"
          rules={[{ required: true, message: '请输入 API Key' }]}
        >
          <Input.Password placeholder="输入云雾 API Key" />
        </Form.Item>
        <Form.Item>
          <div className="mb-2 text-sm text-gray-500">生成尺寸</div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-lg">
              <span>1K</span>
              <Form.Item name="enable1K" valuePropName="checked" noStyle>
                <Switch />
              </Form.Item>
            </div>
            <div className="flex items-center gap-2">
              <span>2K</span>
              <Form.Item name="enable2K" valuePropName="checked" noStyle>
                <Switch />
              </Form.Item>
            </div>
            <div className="flex items-center gap-2">
              <span>4K</span>
              <Form.Item name="enable4K" valuePropName="checked" noStyle>
                <Switch disabled={isPublic} />
              </Form.Item>
            </div>
          </div>
          <div className="mt-1 flex items-start gap-1 text-xs text-red-500">
            <ExclamationCircleOutlined className="mt-1" />
            <div>
              {isPublic ? (
                <div>公用 API Key 无法使用 4K 画质</div>
              ) : (
                <>
                  <div>开启 4K 后，Token 消耗是 2K 的 2~4 倍</div>
                  <div>单张图片可能产生 0.2 元以上的费用</div>
                  <div>图片将按比例缩放到总像素不超过 8294400</div>
                  <div>更容易失败或命中高倍率的分组</div>
                </>
              )}
            </div>
          </div>
        </Form.Item>
        <Form.Item>
          <div className="mb-2 text-sm text-gray-500">画质设置</div>
          <Form.Item name="quality" noStyle>
            <Radio.Group>
              <Radio.Button value="medium">Medium</Radio.Button>
              <Radio.Button value="high" disabled={isPublic}>
                High
              </Radio.Button>
            </Radio.Group>
          </Form.Item>
          <div className="mt-1 flex items-start gap-1 text-xs text-red-500">
            <ExclamationCircleOutlined className="mt-1" />
            <div>
              {isPublic ? (
                <div>公用 API Key 无法使用 High 画质</div>
              ) : (
                <>
                  <div>High 画质处理小字扭曲等细节效果更好 </div>
                  <div>
                    但 Token 消耗大约变为 4倍，整体性价比远不如提升画面尺寸
                  </div>
                  <div>更容易失败或命中高倍率的分组</div>
                </>
              )}
            </div>
          </div>
        </Form.Item>
      </Form>
    </div>
  )
})
