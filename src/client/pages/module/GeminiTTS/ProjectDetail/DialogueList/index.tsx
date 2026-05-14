import {
  DeleteOutlined,
  EditOutlined,
  LoadingOutlined,
  PlayCircleOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import { Button, message, Space, Table } from 'antd'
import { useMemo, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { TTSCharacter, TTSDialogue } from '../../../../../../server/module/tts'
import { CustomAudio } from '../components/Audio'
import { generateTTS } from '../generate'
import { DialogueModal, DialogueModalRef } from './DialogueModal'

interface DialogueListProps {
  dialogues: TTSDialogue[]
  characters: TTSCharacter[]
  onUpdateDialogues: (dialogues: TTSDialogue[]) => void
}

export const DialogueList = ({
  dialogues = [],
  characters = [],
  onUpdateDialogues,
}: DialogueListProps) => {
  const modalRef = useRef<DialogueModalRef>(null)
  const [generatingId, setGeneratingId] = useState<string | null>(null)

  const sortedDialogues = useMemo(() => {
    return [...dialogues].sort((a, b) => a.createdAt - b.createdAt)
  }, [dialogues])

  const handleOpenModal = (dialogue?: TTSDialogue) => {
    modalRef.current?.open(dialogue)
  }

  const handleSave = (
    values: Omit<TTSDialogue, 'id' | 'createdAt'> | TTSDialogue,
  ) => {
    let newDialogues
    if ('id' in values) {
      newDialogues = dialogues.map((d) =>
        d.id === values.id
          ? {
              ...d,
              ...values,
              audioUrl:
                d.content !== values.content ||
                d.instruction !== values.instruction
                  ? undefined
                  : d.audioUrl,
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
        text: dialogue.content,
        instruction: dialogue.instruction || '',
        voiceId: character.voiceId,
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
      render: () => {
        return null
      },
    },
    {
      title: '对话内容/指令控制',
      dataIndex: 'content',
      key: 'content',
      render: (content: string, record: TTSDialogue) => (
        <div className="flex min-w-[100px] flex-col gap-1">
          <div className="whitespace-pre-wrap text-slate-600">{content}</div>
          {record.instruction && (
            <div className="text-sm text-slate-400">
              指令：{record.instruction}
            </div>
          )}
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

      <DialogueModal
        ref={modalRef}
        characters={characters}
        onSave={handleSave}
      />
    </div>
  )
}
