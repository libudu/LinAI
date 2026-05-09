import {
  DeleteOutlined,
  EditOutlined,
  LoadingOutlined,
  PlayCircleOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  Form,
  Input,
  message,
  Modal,
  Pagination,
  Select,
  Space,
  Tag,
} from 'antd'
import { hc } from 'hono/client'
import { useMemo, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import type { AppType } from '../../../../../server'
import {
  GeminiTTSCharacter,
  GeminiTTSDialogue,
} from '../../../../../server/module/gemini-tts'

const client = hc<AppType>('/')
const { TextArea } = Input
const { Option } = Select

interface DialogueListProps {
  dialogues: GeminiTTSDialogue[]
  characters: GeminiTTSCharacter[]
  onUpdateDialogues: (dialogues: GeminiTTSDialogue[]) => void
}

export const DialogueList = ({
  dialogues = [],
  characters = [],
  onUpdateDialogues,
}: DialogueListProps) => {
  const [currentPage, setCurrentPage] = useState(1)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingDialogue, setEditingDialogue] =
    useState<GeminiTTSDialogue | null>(null)
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [form] = Form.useForm()

  const pageSize = 10

  const sortedDialogues = useMemo(() => {
    return [...dialogues].sort((a, b) => a.createdAt - b.createdAt)
  }, [dialogues])

  const currentData = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return sortedDialogues.slice(startIndex, startIndex + pageSize)
  }, [sortedDialogues, currentPage])

  const handleOpenModal = (dialogue?: GeminiTTSDialogue) => {
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

  const handleGenerate = async (dialogue: GeminiTTSDialogue) => {
    const character = characters.find((c) => c.id === dialogue.characterId)
    if (!character) {
      message.error('该对话关联的人物不存在，无法生成语音')
      return
    }

    setGeneratingId(dialogue.id)
    try {
      const response = await client.api['gemini-tts'].generate.$post({
        json: { prompt: dialogue.content, voiceName: character.voiceName },
      })

      const data = await response.json()
      if (data.success) {
        const newDialogues = dialogues.map((d) =>
          d.id === dialogue.id ? { ...d, audioUrl: data.url } : d,
        )
        onUpdateDialogues(newDialogues)
        message.success('生成成功')
      } else {
        message.error(data.error || '生成失败')
      }
    } catch (error: any) {
      message.error(error.message || '网络错误')
    } finally {
      setGeneratingId(null)
    }
  }

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

      <div className="space-y-4">
        {currentData.map((dialogue) => {
          const character = characters.find(
            (c) => c.id === dialogue.characterId,
          )
          const isGenerating = generatingId === dialogue.id

          return (
            <Card key={dialogue.id} size="small" className="shadow-sm">
              <div className="flex gap-4">
                <div className="flex-1">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="font-bold text-slate-700">
                      {character ? (
                        character.name
                      ) : (
                        <span className="text-red-500">人物已删除</span>
                      )}
                    </span>
                    {character && (
                      <Tag color="blue" className="m-0 border-0 text-xs">
                        音色: {character.voiceName}
                      </Tag>
                    )}
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3 whitespace-pre-wrap text-slate-600">
                    {dialogue.content}
                  </div>
                </div>
                <div className="flex w-32 shrink-0 flex-col items-end justify-between border-l border-slate-100 pl-4">
                  <Space>
                    <Button
                      type="text"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => handleOpenModal(dialogue)}
                    />
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => handleDelete(dialogue.id)}
                    />
                  </Space>
                  <div className="mt-4 flex w-full justify-end">
                    {dialogue.audioUrl ? (
                      <audio
                        controls
                        src={dialogue.audioUrl}
                        className="h-8 w-48"
                      />
                    ) : (
                      <Button
                        type="primary"
                        size="small"
                        disabled={!character || isGenerating}
                        onClick={() => handleGenerate(dialogue)}
                        icon={
                          isGenerating ? (
                            <LoadingOutlined />
                          ) : (
                            <PlayCircleOutlined />
                          )
                        }
                      >
                        {isGenerating ? '生成中' : '生成语音'}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          )
        })}

        {dialogues.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 py-8 text-center text-slate-400">
            暂无对话，请先添加对话块
          </div>
        )}
      </div>

      {dialogues.length > 0 && (
        <div className="mt-4 flex justify-end">
          <Pagination
            current={currentPage}
            pageSize={pageSize}
            total={dialogues.length}
            onChange={setCurrentPage}
            showSizeChanger={false}
          />
        </div>
      )}

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
                  {c.name} ({c.voiceName})
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
            <TextArea rows={6} placeholder="请输入该人物的对话内容..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
