import { Form, Input, message } from 'antd'
import { createRef, forwardRef, useEffect, useImperativeHandle } from 'react'
import { openCommonSettingModal } from '../../../common/components/SettingModal'
import { useEagleStore } from '../store'
import { useEagleConfig } from './useEagleConfig'

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

// 打开 Eagle 图片管理设置弹窗
export function openEagleSettingModal() {
  const eagleRef = createRef<EagleSettingRef>()
  openCommonSettingModal({
    title: 'Eagle 图片管理设置',
    tabs: [
      {
        key: 'eagle',
        label: '资源库',
        children: <EagleSetting ref={eagleRef} />,
        onSave: () => eagleRef.current!.save(),
      },
    ],
  })
}
