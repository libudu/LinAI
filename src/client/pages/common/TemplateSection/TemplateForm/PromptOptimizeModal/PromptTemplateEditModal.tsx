import { Button, Input, Modal, message } from 'antd'
import { useEffect, useState } from 'react'

interface PromptTemplateEditModalProps {
  open: boolean
  template: string
  defaultTemplate: string
  onClose: () => void
  onSave: (template: string) => void
}

export function PromptTemplateEditModal({
  open,
  template,
  defaultTemplate,
  onClose,
  onSave,
}: PromptTemplateEditModalProps) {
  const [messageApi, contextHolder] = message.useMessage()
  const [draftTemplate, setDraftTemplate] = useState(template)

  useEffect(() => {
    if (open) {
      setDraftTemplate(template)
    }
  }, [open, template])

  const handleSave = () => {
    const trimmedTemplate = draftTemplate.trim()
    if (!trimmedTemplate) {
      messageApi.warning('请输入提示词优化模板')
      return
    }

    onSave(trimmedTemplate)
    messageApi.success('优化模板已保存')
    onClose()
  }

  const handleUseDefaultTemplate = () => {
    setDraftTemplate(defaultTemplate)
    messageApi.success('已恢复为默认模板')
  }

  return (
    <>
      {contextHolder}
      <Modal
        title="修改优化模板"
        open={open}
        onCancel={onClose}
        destroyOnHidden
        width={720}
        footer={
          <div className="flex justify-between">
            <Button onClick={handleUseDefaultTemplate}>重置为默认模板</Button>
            <div className="flex gap-3">
              <Button onClick={onClose}>取消</Button>
              <Button type="primary" onClick={handleSave}>
                保存
              </Button>
            </div>
          </div>
        }
      >
        <div className="mt-4">
          <Input.TextArea
            value={draftTemplate}
            onChange={(event) => setDraftTemplate(event.target.value)}
            autoSize={{
              minRows: 12,
              maxRows: 24,
            }}
            placeholder="请输入提示词优化模板"
            style={{ resize: 'none' }}
          />
        </div>
      </Modal>
    </>
  )
}
