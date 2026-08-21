import { Form, Input, message } from 'antd'
import { createRef, forwardRef, useEffect, useImperativeHandle } from 'react'
import {
  openCommonSettingModal,
  type CommonSettingTab,
} from '../../../common/components/SettingModal'
import { useEagleStore } from '../store'
import { useEagleConfig } from './useEagleConfig'
import {
  VisionEndpointSetting,
  type VisionEndpointSettingRef,
} from './VisionEndpointSetting'

interface EagleSettingRef {
  save: () => Promise<void>
}

const EagleSetting = forwardRef<EagleSettingRef>((_props, ref) => {
  const [form] = Form.useForm()
  const { libraryPath, setEagleConfig } = useEagleConfig()
  const reload = useEagleStore((s) => s.reload)

  useEffect(() => {
    form.setFieldsValue({ libraryPath: libraryPath || '' })
  }, [libraryPath, form])

  useImperativeHandle(ref, () => ({
    save: async () => {
      const values = await form.validateFields()
      await setEagleConfig(values.libraryPath?.trim() || null)
      message.success('配置保存成功')
      // 库路径变化后重建索引并刷新页面数据
      await reload()
    },
  }))

  return (
    <div className="px-4 py-2">
      <Form form={form} layout="vertical">
        <Form.Item
          name="libraryPath"
          label="Eagle 资源库路径"
          extra="填 .library 目录的绝对路径，如 D:\Linpicio\收藏\eagle 仓库\测试.library（模块只读，不会修改库内文件）"
          rules={[{ required: true, message: '请输入资源库路径' }]}
        >
          <Input placeholder="D:\...\xxx.library" />
        </Form.Item>
      </Form>
    </div>
  )
})

// 打开 Eagle 图片管理设置弹窗（资源库 / 视觉接入点，两者配置互相独立）
export function openEagleSettingModal(options?: {
  initialTab?: string
  initialOnly?: boolean
  onSuccess?: (apiKey: string) => void
}) {
  const eagleRef = createRef<EagleSettingRef>()
  const visionEndpointRef = createRef<VisionEndpointSettingRef>()

  const tabs: CommonSettingTab[] = [
    {
      key: 'eagle',
      label: '资源库',
      children: <EagleSetting ref={eagleRef} />,
      onSave: () => eagleRef.current!.save(),
    },
    {
      key: 'vision-endpoint',
      label: '视觉接入点',
      children: <VisionEndpointSetting ref={visionEndpointRef} />,
      onSave: () => visionEndpointRef.current!.save(),
    },
  ]

  const initialTabItem =
    tabs.find((tab) => tab.key === options?.initialTab) ?? tabs[0]
  const visibleTabs = options?.initialOnly ? [initialTabItem] : tabs

  openCommonSettingModal({
    title: options?.initialOnly ? initialTabItem.label : 'Eagle 图片管理设置',
    tabs: visibleTabs,
    initialTab: options?.initialTab,
    okText: options?.onSuccess ? '保存并继续' : '保存',
    onSuccess: (result) => options?.onSuccess?.(result as string),
  })
}
