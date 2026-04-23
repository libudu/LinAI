import { useEffect } from 'react'
import { Modal, Form, Input, message } from 'antd'
import { useGlobalStore } from '../../store/global'

interface GPTTokenModalProps {
  open: boolean
  onClose: () => void
  onSuccess?: (apiKey: string) => void
}

export function GPTTokenModal({
  open,
  onClose,
  onSuccess
}: GPTTokenModalProps) {
  const [form] = Form.useForm()
  const { gptImageApiKey, setGptImageApiKey } = useGlobalStore()

  useEffect(() => {
    if (open) {
      if (gptImageApiKey) {
        form.setFieldsValue({ apiKey: gptImageApiKey })
      }
    }
  }, [open, form, gptImageApiKey])

  const handleSaveKey = () => {
    const values = form.getFieldsValue()
    if (!values.apiKey) {
      message.warning('请输入 API Key')
      return
    }
    setGptImageApiKey(values.apiKey)
    message.success('API Key 保存成功')
    onSuccess?.(values.apiKey)
    onClose()
  }

  return (
    <Modal
      title="配置 GPT 图片生成 API Key"
      open={open}
      onCancel={onClose}
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
