import { PlayCircleOutlined } from '@ant-design/icons'
import { useLocalStorageState } from 'ahooks'
import { AutoComplete, Button, Form, Input, message, Modal } from 'antd'
import { forwardRef, useImperativeHandle, useMemo, useState } from 'react'
import { TTSCharacter } from '../../../../../../server/module/tts'
import { useTTSStore } from '../../store'
import { CustomAudio } from '../components/Audio'
import { generateTTS } from '../generate'

export interface CharacterModalRef {
  open: (character?: TTSCharacter) => void
}

interface CharacterModalProps {
  onSave: (characterData: Omit<TTSCharacter, 'id'> | TTSCharacter) => void
}

export const CharacterModal = forwardRef<
  CharacterModalRef,
  CharacterModalProps
>(({ onSave }, ref) => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCharacter, setEditingCharacter] = useState<TTSCharacter | null>(
    null,
  )
  const [form] = Form.useForm()

  const [previewText, setPreviewText] = useLocalStorageState(
    'gemini-tts-preview-text',
    {
      defaultValue: '你好，我是当前音色的测试语音。',
    },
  )
  const [previewAudio, setPreviewAudio] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)

  const { voiceList } = useTTSStore()
  const voiceOptions = useMemo(() => {
    return voiceList.map((voice) => ({
      value: voice.voice_id,
      remark: voice.remark,
      searchText: `${voice.voice_id} ${voice.remark || ''}`,
    }))
  }, [voiceList])

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
    const voiceId = form.getFieldValue('voiceId')
    if (!voiceId) {
      message.warning('请先输入音色 ID')
      return
    }
    if (!previewText.trim()) {
      message.warning('请输入试听文本')
      return
    }

    setIsGenerating(true)
    try {
      const url = await generateTTS({
        text: previewText,
        instruction: '',
        voiceId,
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
          name="voiceId"
          label="分配音色"
          rules={[{ required: true, message: '请输入音色 ID' }]}
        >
          <AutoComplete
            placeholder="请选择或输入阿里云 DashScope 定制音色 ID"
            onChange={() => setPreviewAudio(null)}
            showSearch={{
              filterOption: (inputValue, option: any) =>
                String(option?.searchText || option?.value || '')
                  .toUpperCase()
                  .indexOf(inputValue.toUpperCase()) !== -1,
            }}
          >
            {voiceOptions.map((option) => (
              <AutoComplete.Option
                key={option.value}
                value={option.value}
                searchText={option.searchText}
              >
                <div className="flex items-center justify-between">
                  <span className="truncate">{option.value}</span>
                  {option.remark && (
                    <span className="ml-2 max-w-[150px] text-sm text-gray-400">
                      {option.remark}
                    </span>
                  )}
                </div>
              </AutoComplete.Option>
            ))}
          </AutoComplete>
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
              <CustomAudio src={previewAudio} className="mt-2 w-full" />
            )}
          </div>
        </Form.Item>
      </Form>
    </Modal>
  )
})
