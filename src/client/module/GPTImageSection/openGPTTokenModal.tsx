import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { Modal, Form, Input, message } from 'antd'
import { useGlobalStore } from '../../store/global'

export function openGPTTokenModal(options?: { onSuccess?: (apiKey: string) => void }) {
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

    useEffect(() => {
      if (gptImageApiKey) {
        form.setFieldsValue({ apiKey: gptImageApiKey })
      }
    }, [gptImageApiKey, form])

    const handleSaveKey = () => {
      const values = form.getFieldsValue()
      if (!values.apiKey) {
        message.warning('请输入 API Key')
        return
      }
      setGptImageApiKey(values.apiKey)
      message.success('API Key 保存成功')
      options?.onSuccess?.(values.apiKey)
      destroy()
    }

    return (
      <Modal
        title="配置 GPT 图片生成 API Key"
        open={true}
        onCancel={destroy}
        onOk={handleSaveKey}
        okText="保存并继续"
        cancelText="取消"
        destroyOnClose
        width={400}
      >
        <div className="py-4">
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
      </Modal>
    )
  }

  root.render(<ModalComponent />)
}
