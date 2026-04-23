import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Modal, Form, Input, message, Tabs } from 'antd'
import { useGlobalStore } from '../../store/global'

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
    const [activeTab, setActiveTab] = useState(
      options?.initialTab || 'gpt-image'
    )

    useEffect(() => {
      if (gptImageApiKey) {
        form.setFieldsValue({ apiKey: gptImageApiKey })
      }
    }, [gptImageApiKey, form])

    const handleSave = async () => {
      try {
        const values = await form.validateFields()
        if (activeTab === 'gpt-image') {
          if (!values.apiKey) {
            message.warning('请输入 API Key')
            return
          }
          setGptImageApiKey(values.apiKey)
          message.success('API Key 保存成功')
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
