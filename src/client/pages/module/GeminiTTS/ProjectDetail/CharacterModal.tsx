import { PlayCircleOutlined } from '@ant-design/icons'
import { useLocalStorageState } from 'ahooks'
import { Button, Form, Input, message, Modal, Select, Tag } from 'antd'
import { forwardRef, useImperativeHandle, useState } from 'react'
import { GeminiTTSCharacter } from '../../../../../server/module/gemini-tts'
import { generateTTS } from '../generate'
import { voiceList } from './voiceConfig'

const { Option } = Select

export interface CharacterModalRef {
  open: (character?: GeminiTTSCharacter) => void
}

interface CharacterModalProps {
  backgroundPrompt: string
  onSave: (
    characterData: Omit<GeminiTTSCharacter, 'id'> | GeminiTTSCharacter,
  ) => void
}

export const CharacterModal = forwardRef<
  CharacterModalRef,
  CharacterModalProps
>(({ backgroundPrompt, onSave }, ref) => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCharacter, setEditingCharacter] =
    useState<GeminiTTSCharacter | null>(null)
  const [form] = Form.useForm()

  const [previewText, setPreviewText] = useLocalStorageState(
    'gemini-tts-preview-text',
    {
      defaultValue: '你好，我是当前音色的测试语音。',
    },
  )
  const [previewAudio, setPreviewAudio] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)

  useImperativeHandle(ref, () => ({
    open: (character) => {
      if (character) {
        setEditingCharacter(character)
        form.setFieldsValue(character)
      } else {
        setEditingCharacter(null)
        form.resetFields()
      }
      setPreviewAudio(null)
      setIsModalOpen(true)
    },
  }))

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setEditingCharacter(null)
    form.resetFields()
    setPreviewAudio(null)
  }

  const handleSave = () => {
    form.validateFields().then((values) => {
      if (editingCharacter) {
        onSave({ ...editingCharacter, ...values })
      } else {
        onSave(values)
      }
      handleCloseModal()
    })
  }

  const handlePreview = async () => {
    const voiceName = form.getFieldValue('voiceName')
    if (!voiceName) {
      message.warning('请先选择音色')
      return
    }
    if (!previewText.trim()) {
      message.warning('请输入试听文本')
      return
    }

    setIsGenerating(true)
    try {
      const voicePrompt = form.getFieldValue('voicePrompt') || ''
      const url = await generateTTS({
        backgroundPrompt,
        voicePrompt,
        contentPrompt: previewText,
        voiceName,
      })
      setPreviewAudio(url)
    } catch (error: any) {
      message.error(error.message || '网络错误')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <Modal
      title={editingCharacter ? '编辑人物' : '添加人物'}
      open={isModalOpen}
      onCancel={handleCloseModal}
      onOk={handleSave}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="name"
          label="人物名称"
          rules={[{ required: true, message: '请输入人物名称' }]}
        >
          <Input placeholder="例如：旁白、小明" />
        </Form.Item>

        <Form.Item
          name="voiceName"
          label="分配音色"
          rules={[{ required: true, message: '请选择音色' }]}
        >
          <Select
            placeholder="请选择音色"
            optionLabelProp="label"
            dropdownMatchSelectWidth={false}
            onChange={() => setPreviewAudio(null)}
          >
            {voiceList.map((item) => (
              <Option key={item.name} value={item.name} label={item.name}>
                <div className="flex items-center justify-between gap-4">
                  <span className="font-medium">{item.name}</span>
                  <div className="flex gap-1">
                    <Tag color="blue" className="m-0 border-0">
                      {item.voice}
                    </Tag>
                    <Tag
                      color={item.gender === '男' ? 'cyan' : 'magenta'}
                      className="m-0 border-0"
                    >
                      {item.gender}
                    </Tag>
                  </div>
                </div>
              </Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item name="voicePrompt" label="音色微调">
          <Input.TextArea
            placeholder="角色年龄/性格/声音类型/其他特征"
            autoSize={{
              minRows: 4,
              maxRows: 4,
            }}
          />
        </Form.Item>

        <Form.Item label="音色试听">
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Input
                value={previewText}
                onChange={(e) => setPreviewText(e.target.value)}
                placeholder="请输入试听文本"
              />
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={handlePreview}
                loading={isGenerating}
              >
                生成试听
              </Button>
            </div>
            {previewAudio && (
              <audio
                controls
                src={previewAudio}
                className="mt-2 w-full"
                autoPlay
              />
            )}
          </div>
        </Form.Item>
      </Form>
    </Modal>
  )
})
