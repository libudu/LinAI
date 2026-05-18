import {
  DeleteOutlined,
  EditOutlined,
  LoadingOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons'
import { Button, message, Space, Table, Tag, Tooltip } from 'antd'
import { useMemo, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import {
  TTSCharacter,
  TTSDialogue,
  TTSProject,
} from '../../../../../../server/module/tts'
import { CustomAudio } from '../components/Audio'
import { generateTTS } from '../generate'
import { DialogueModal, DialogueModalRef } from './DialogueModal'

import { useTTSStore } from '../../store'
import { inworldSourceMap } from '../VoiceList'
import { ControlPanel } from './ControlPanel'

interface DialogueListProps {
  dialogues: TTSDialogue[]
  characters: TTSCharacter[]
  onUpdateProject: (
    updates: Partial<Omit<TTSProject, 'id' | 'createdAt'>>,
  ) => void
}

export const DialogueList = ({
  dialogues = [],
  characters = [],
  onUpdateProject,
}: DialogueListProps) => {
  const modalRef = useRef<DialogueModalRef>(null)
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const { voiceList } = useTTSStore()

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

    onUpdateProject({ dialogues: newDialogues })
  }

  const handleDelete = (id: string) => {
    const newDialogues = dialogues.filter((d) => d.id !== id)
    onUpdateProject({ dialogues: newDialogues })
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
        voiceId: character.voiceId,
      })
      const newDialogues = dialogues.map((d) =>
        d.id === dialogue.id ? { ...d, audioUrl: url } : d,
      )
      onUpdateProject({ dialogues: newDialogues })
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
      width: 150,
      render: (characterId: string) => {
        const character = characters.find((c) => c.id === characterId)
        if (!character) {
          return <span className="font-bold text-red-500">人物已删除</span>
        }

        const voice = voiceList?.find((v) => v.voiceId === character.voiceId)

        return (
          <div className="flex flex-col gap-1">
            <span className="font-bold text-slate-700">{character.name}</span>
            <div className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
              <span>音色：</span>
              <span className="font-bold">{voice?.displayName}</span>
              {!voice && <Tag color="red">暂无音色</Tag>}
            </div>
            <div>
              {voice?.source && (
                <Tag
                  color="green"
                  className="m-0 border-none px-1 text-[10px] leading-[14px]"
                >
                  {inworldSourceMap[voice.source] || voice.source}
                </Tag>
              )}
            </div>
          </div>
        )
      },
    },
    {
      title: '对话内容',
      dataIndex: 'content',
      key: 'content',
      render: (content: string, record: TTSDialogue) => (
        <div className="flex min-w-[100px] flex-col gap-1">
          {record.data?.renpyId && (
            <Tooltip title={record.data.renpyId}>
              <div className="mb-1 line-clamp-1 text-xs break-all text-slate-400">
                RenpyID: {record.data.renpyId}
              </div>
            </Tooltip>
          )}
          <Tooltip title={content}>
            <div className="line-clamp-2 whitespace-pre-wrap text-slate-600">
              {content}
            </div>
          </Tooltip>
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
      <ControlPanel
        dialogues={dialogues}
        characters={characters}
        onAddClick={() => handleOpenModal()}
        onUpdateProject={onUpdateProject}
      />

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
