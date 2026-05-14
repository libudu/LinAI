import {
  DeleteOutlined,
  EditOutlined,
  LoadingOutlined,
  PlayCircleOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import { Button, Form, Input, message, Modal, Select, Space, Table } from 'antd'
import { useMemo, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { TTSCharacter, TTSDialogue } from '../../../../../server/module/tts'
import { generateTTS } from '../generate'
import { CustomAudio } from './components/Audio'

const { TextArea } = Input
const { Option } = Select

interface DialogueListProps {
  backgroundPrompt: string
  dialogues: TTSDialogue[]
  characters: TTSCharacter[]
  onUpdateDialogues: (dialogues: TTSDialogue[]) => void
}

export const DialogueList = ({
  backgroundPrompt,
  dialogues = [],
  characters = [],
  onUpdateDialogues,
}: DialogueListProps) => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingDialogue, setEditingDialogue] = useState<TTSDialogue | null>(
    null,
  )
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [form] = Form.useForm()

  const sortedDialogues = useMemo(() => {
    return [...dialogues].sort((a, b) => a.createdAt - b.createdAt)
  }, [dialogues])

  const handleOpenModal = (dialogue?: TTSDialogue) => {
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
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setEditingDialogue(null)
    form.resetFields()
  }

  const handleSave = () => {
    form.validateFields().then((values) => {
      let newDialogues
      if (editingDialogue) {
        newDialogues = dialogues.map((d) =>
          d.id === editingDialogue.id
            ? {
                ...d,
                ...values,
                audioUrl: d.content !== values.content ? undefined : d.audioUrl,
              }
            : d,
        )
      } else {
        newDialogues = [
          ...dialogues,
          { id: uuidv4(), ...values, createdAt: Date.now() },
        ]
      }

      onUpdateDialogues(newDialogues)
      handleCloseModal()
    })
  }

  const handleDelete = (id: string) => {
    const newDialogues = dialogues.filter((d) => d.id !== id)
    onUpdateDialogues(newDialogues)
  }

  const handleGenerate = async (dialogue: TTSDialogue) => {
    const character = characters.find((c) => c.id === dialogue.characterId)
    if (!character) {
      message.error('该对话关联的人物不存在，无法生成语音')
      return
    }

    setGeneratingId(dialogue.id)
    try {
      const url = await generateTTS({
        backgroundPrompt,
        voicePrompt: character.voicePrompt || '',
        contentPrompt: dialogue.content,
        voiceName: character.voiceName,
      })
      const newDialogues = dialogues.map((d) =>
        d.id === dialogue.id ? { ...d, audioUrl: url } : d,
      )
      onUpdateDialogues(newDialogues)
      message.success('生成成功')
    } catch (error: any) {
      message.error(error.message || '网络错误')
    } finally {
      setGeneratingId(null)
    }
  }

  const columns = [
    {
      title: '人物',
      dataIndex: 'characterId',
      key: 'character',
      width: 100,
      render: (characterId: string) => {
        const character = characters.find((c) => c.id === characterId)
        return (
          <span className="font-bold text-slate-700">
            {character ? (
              character.name
            ) : (
              <span className="text-red-500">人物已删除</span>
            )}
          </span>
        )
      },
    },
    {
      title: '音色',
      dataIndex: 'characterId',
      key: 'voice',
      width: 150,
      render: (characterId: string) => {
        const character = characters.find((c) => c.id === characterId)
        return null
      },
    },
    {
      title: '对话内容',
      dataIndex: 'content',
      key: 'content',
      render: (content: string) => (
        <div className="min-w-[100px] whitespace-pre-wrap text-slate-600">
          {content}
        </div>
      ),
    },
    {
      title: '音频',
      key: 'audio',
      width: 250,
      render: (_: any, record: TTSDialogue) => {
        const character = characters.find((c) => c.id === record.characterId)
        const isGenerating = generatingId === record.id

        return record.audioUrl ? (
          <CustomAudio src={record.audioUrl} className="h-10 w-48" />
        ) : (
          <Button
            type="primary"
            size="small"
            disabled={!character || isGenerating}
            onClick={() => handleGenerate(record)}
            icon={isGenerating ? <LoadingOutlined /> : <PlayCircleOutlined />}
          >
            {isGenerating ? '生成中' : '生成语音'}
          </Button>
        )
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_: any, record: TTSDialogue) => (
        <Space>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleOpenModal(record)}
          />
          <Button
            type="text"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record.id)}
          />
        </Space>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-700">对话列表</h3>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => handleOpenModal()}
        >
          添加对话
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={sortedDialogues}
        rowKey="id"
        pagination={{
          pageSize: 10,
          showSizeChanger: false,
        }}
        locale={{
          emptyText: (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 py-8 text-center text-slate-400">
              暂无对话，请先添加对话块
            </div>
          ),
        }}
      />

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
            name="content"
            label="对话内容"
            rules={[{ required: true, message: '请输入对话内容' }]}
            extra={editingDialogue && '修改对话内容后需要重新生成语音'}
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
    </div>
  )
}
