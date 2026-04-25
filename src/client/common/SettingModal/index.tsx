import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Modal, Form, Input, message, Tabs, Switch } from 'antd'
import { useGlobalStore } from '../../store/global'
import { useLocalSetting } from '../../hooks/useLocalSetting'

import { ExclamationCircleOutlined } from '@ant-design/icons'

export function openSettingModal(options?: {
  initialTab?: string
  onSuccess?: (apiKey: string) => void
}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  function destroy() {
    root.unmount()
    if (container.parentNode) {
      container.parentNode.removeChild(container)
    }
  }

  function ModalComponent() {
    const [form] = Form.useForm()
    const { gptImageApiKey, setGptImageApiKey } = useGlobalStore()
    const { gptImageSettings, setGptImageSettings } = useLocalSetting()
    const [activeTab, setActiveTab] = useState(
      options?.initialTab || 'gpt-image'
    )

    const enable4K = Form.useWatch('enable4K', form)

    useEffect(() => {
      form.setFieldsValue({
        apiKey: gptImageApiKey || '',
        enable1K: gptImageSettings.enable1K,
        enable2K: gptImageSettings.enable2K,
        enable4K: gptImageSettings.enable4K
      })
    }, [gptImageApiKey, gptImageSettings, form])

    const handleSave = async () => {
      try {
        const values = await form.validateFields()
        if (activeTab === 'gpt-image') {
          if (!values.apiKey) {
            message.warning('请输入 API Key')
            return
          }
          await setGptImageApiKey(values.apiKey)
          setGptImageSettings({
            enable1K: values.enable1K,
            enable2K: values.enable2K,
            enable4K: values.enable4K
          })
          message.success('配置保存成功')
          options?.onSuccess?.(values.apiKey)
        }
        destroy()
      } catch (error) {
        // 表单验证失败
      }
    }

    const items = [
      {
        key: 'gpt-image',
        label: 'GPTImage2 配置',
        children: (
          <div className="py-2 px-4">
            <Form form={form} layout="vertical">
              <Form.Item
                name="apiKey"
                label="API Key"
                rules={[{ required: true, message: '请输入 API Key' }]}
              >
                <Input.Password placeholder="输入 t8star API Key" />
              </Form.Item>
              <Form.Item>
                <div className="text-sm text-gray-500 mb-2">画质</div>
                <div className="flex justify-between items-center">
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
                      <Switch />
                    </Form.Item>
                  </div>
                </div>
                {enable4K && (
                  <div className="text-red-500 text-xs flex items-start gap-1 mt-1">
                    <ExclamationCircleOutlined className="mt-[2px]" />
                    <span>
                      费用提示：开启 4K 后，Token 消耗是 2K 的 4
                      倍以上，单张图片可能产生 0.2
                      元以上的费用，图片将按比例缩放到总像素不超过
                      8294400，请注意费用消耗。
                    </span>
                  </div>
                )}
              </Form.Item>
            </Form>
          </div>
        )
      }
    ]

    return (
      <Modal
        title="设置"
        open={true}
        onCancel={destroy}
        onOk={handleSave}
        okText={options?.onSuccess ? '保存并继续' : '保存'}
        cancelText="取消"
        destroyOnClose
        width={600}
      >
        <div className="pt-4 min-h-[200px]">
          <Tabs
            tabPosition="left"
            activeKey={activeTab}
            onChange={setActiveTab}
            items={items}
          />
        </div>
      </Modal>
    )
  }

  root.render(<ModalComponent />)
}
