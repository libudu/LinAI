import { useLocalSetting } from '@/client/hooks/useLocalSetting'
import { ExclamationCircleOutlined } from '@ant-design/icons'
import { Form, Radio, Switch, message } from 'antd'
import { createRef, forwardRef, useEffect, useImperativeHandle } from 'react'
import {
  openCommonSettingModal,
  type CommonSettingTab,
} from '../../components/SettingModal'
import { useGPTImageQuota } from '../hooks/useGPTImageQuota'
import {
  EndpointSetting,
  type EndpointSettingRef,
} from './Endpoint/EndpointSetting'
import { SideSetting } from './SideSetting'
import { UploadImageSetting } from './UploadImageSetting'
import {
  VisionEndpointSetting,
  type VisionEndpointSettingRef,
} from './VisionEndpoint/VisionEndpointSetting'

interface GPTImageSettingRef {
  save: () => Promise<void>
}

const GPTImageSetting = forwardRef<GPTImageSettingRef>((_props, ref) => {
  const [form] = Form.useForm()
  const { gptImageSettings, setGptImageSettings } = useLocalSetting()
  const { isPublic } = useGPTImageQuota()

  useEffect(() => {
    form.setFieldsValue({
      enable1K: gptImageSettings.enable1K,
      enable2K: gptImageSettings.enable2K,
      enable4K: gptImageSettings.enable4K,
      quality: gptImageSettings.quality,
      enableMultiple: isPublic ? false : gptImageSettings.enableMultiple,
    })
  }, [
    gptImageSettings.enable1K,
    gptImageSettings.enable2K,
    gptImageSettings.enable4K,
    gptImageSettings.quality,
    gptImageSettings.enableMultiple,
    isPublic,
    form,
  ])

  useImperativeHandle(ref, () => ({
    save: async () => {
      const values = await form.validateFields()
      setGptImageSettings({
        enable1K: values.enable1K ?? gptImageSettings.enable1K,
        enable2K: values.enable2K ?? gptImageSettings.enable2K,
        enable4K: values.enable4K ?? gptImageSettings.enable4K,
        quality: values.quality ?? gptImageSettings.quality,
        enableMultiple: isPublic
          ? false
          : (values.enableMultiple ?? gptImageSettings.enableMultiple),
      })
      message.success('配置保存成功')
    },
  }))

  return (
    <div className="px-4 py-2">
      <Form form={form} layout="vertical">
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
        <Form.Item>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-lg">
              <span className="text-sm text-gray-500">生成多张</span>
              <Form.Item name="enableMultiple" valuePropName="checked" noStyle>
                <Switch disabled={isPublic} />
              </Form.Item>
            </div>
          </div>
          <div className="mt-1 flex items-start gap-1 text-xs text-red-500">
            <ExclamationCircleOutlined className="mt-1" />
            {isPublic ? (
              <div>公用 API Key 无法一次生成多张</div>
            ) : (
              <div>
                <div>生成多张与提交多次相同任务的效果和开销完全等价</div>
                <div>不会节省输入费用，不同张数之间也没有前后关联</div>
              </div>
            )}
          </div>
        </Form.Item>
      </Form>
    </div>
  )
})

// 打开图片生成设置弹窗（生图接入点 / 视觉接入点 / 图片与辅助设置）
export function openGPTImageSettingModal(options?: {
  initialTab?: string
  endpointOnly?: boolean
  onSuccess?: (apiKey: string) => void
}) {
  const endpointRef = createRef<EndpointSettingRef>()
  const visionEndpointRef = createRef<VisionEndpointSettingRef>()
  const gptImageRef = createRef<GPTImageSettingRef>()

  const tabs: CommonSettingTab[] = [
    {
      key: 'endpoint',
      label: '生图接入点',
      children: <EndpointSetting ref={endpointRef} />,
      onSave: () => endpointRef.current!.save(),
    },
    {
      key: 'vision-endpoint',
      label: '视觉接入点',
      children: <VisionEndpointSetting ref={visionEndpointRef} />,
      onSave: () => visionEndpointRef.current!.save(),
    },
    {
      key: 'gpt-image',
      label: 'GPTImage2 配置',
      children: <GPTImageSetting ref={gptImageRef} />,
      onSave: () => gptImageRef.current!.save(),
    },
    {
      key: 'upload-image',
      label: '通用图片设置',
      children: <UploadImageSetting />,
    },
    {
      key: 'side-setting',
      label: '辅助功能',
      children: <SideSetting />,
    },
  ]

  const visibleTabs = options?.endpointOnly
    ? tabs.filter((tab) => tab.key === 'endpoint')
    : tabs

  openCommonSettingModal({
    title: options?.endpointOnly ? '图片生成接入点配置' : '图片生成设置',
    tabs: visibleTabs,
    initialTab: options?.initialTab,
    okText: options?.onSuccess ? '保存并继续' : '保存',
    onSuccess: (result) => options?.onSuccess?.(result as string),
  })
}
