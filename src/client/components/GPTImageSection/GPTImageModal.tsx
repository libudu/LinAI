import { useEffect } from 'react'
import { Modal, Form, Input, Button, message, Card } from 'antd'
import { KeyOutlined } from '@ant-design/icons'
import { TaskFromTemplate } from '../TaskFromTemplate'
import { LogViewer } from '../LogViewer'
import { useGlobalStore } from '../../store/global'

interface GPTImageModalProps {
  open: boolean
  onClose: () => void
}

export function GPTImageModal({ open, onClose }: GPTImageModalProps) {
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
  }

  return (
    <Modal
      title="GPT 图片生成详情"
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnClose
      width={800}
    >
      <div className="flex flex-col gap-6 py-4">
        {/* API Key 配置 */}
        <Card
          size="small"
          title={
            <span className="text-slate-600">
              <KeyOutlined className="mr-2" />
              API 配置
            </span>
          }
          className="shadow-sm border-slate-200"
        >
          <Form form={form} layout="inline" className="flex items-center gap-2">
            <Form.Item name="apiKey" className="flex-1 mb-0">
              <Input.Password placeholder="输入 API Key" />
            </Form.Item>
            <Form.Item className="mb-0">
              <Button type="primary" onClick={handleSaveKey}>
                保存
              </Button>
            </Form.Item>
          </Form>
        </Card>

        {/* 任务管理 */}
        <div className="border-t border-slate-100 pt-6">
          <TaskFromTemplate usageType="image" />
        </div>

        {/* 日志查看器 */}
        <div className="border-t border-slate-100 pt-6">
          <LogViewer moduleId="gpt-image" title="GPT 图片生成日志" />
        </div>
      </div>
    </Modal>
  )
}
