import { Form, Input, Modal, Select } from 'antd'
import { forwardRef, useImperativeHandle, useState } from 'react'
import { TTSCharacter, TTSDialogue } from '../../../../../../server/module/tts'

const { TextArea } = Input
const { Option } = Select

export interface DialogueModalRef {
  open: (dialogue?: TTSDialogue) => void
}

interface DialogueModalProps {
  characters: TTSCharacter[]
  onSave: (dialogueData: Omit<TTSDialogue, 'id' | 'createdAt'> | TTSDialogue) => void
}

export const DialogueModal = forwardRef<DialogueModalRef, DialogueModalProps>(
  ({ characters, onSave }, ref) => {
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingDialogue, setEditingDialogue] = useState<TTSDialogue | null>(null)
    const [form] = Form.useForm()

    useImperativeHandle(ref, () => ({
      open: (dialogue) => {
        if (dialogue) {
          setEditingDialogue(dialogue)
          form.setFieldsValue(dialogue)
        } else {
          setEditingDialogue(null)
          form.resetFields()
          if (characters.length > 0) {
            form.setFieldValue('characterId', characters[0].id)
          }
        }
        setIsModalOpen(true)
      },
    }))

    const handleCloseModal = () => {
      setIsModalOpen(false)
      setEditingDialogue(null)
      form.resetFields()
    }

    const handleSave = () => {
      form.validateFields().then((values) => {
        if (editingDialogue) {
          onSave({ ...editingDialogue, ...values })
        } else {
          onSave(values)
        }
        handleCloseModal()
      })
    }

    return (
      <Modal
        title={editingDialogue ? '编辑对话' : '添加对话'}
        open={isModalOpen}
        onCancel={handleCloseModal}
        onOk={handleSave}
        destroyOnClose
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="characterId"
            label="选择人物"
            rules={[{ required: true, message: '请选择人物' }]}
          >
            <Select placeholder="请选择人物">
              {characters.map((c) => (
                <Option key={c.id} value={c.id}>
                  <div className="flex items-center gap-2">
                    <span>{c.name}</span>
                  </div>
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="instruction"
            label="指令控制"
          >
            <Input placeholder="请输入指令控制 (可选)" />
          </Form.Item>

          <Form.Item
            name="content"
            label="对话内容"
            rules={[{ required: true, message: '请输入对话内容' }]}
            extra={editingDialogue && '修改对话内容或指令后需要重新生成语音'}
          >
            <TextArea
              autoSize={{
                minRows: 3,
                maxRows: 6,
              }}
              placeholder="请输入该人物的对话内容..."
            />
          </Form.Item>
        </Form>
      </Modal>
    )
  },
)
