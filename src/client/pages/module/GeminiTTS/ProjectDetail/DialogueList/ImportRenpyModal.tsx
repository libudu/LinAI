import { Modal, Table } from 'antd'
import { forwardRef, useImperativeHandle, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { TTSCharacter, TTSDialogue } from '../../../../../../server/module/tts'

export interface ImportRenpyModalRef {
  open: (file: File) => void
}

interface ImportRenpyModalProps {
  characters: TTSCharacter[]
  onConfirm: (
    newCharacters: TTSCharacter[],
    newDialogues: TTSDialogue[],
  ) => void
}

export const ImportRenpyModal = forwardRef<
  ImportRenpyModalRef,
  ImportRenpyModalProps
>(({ characters, onConfirm }, ref) => {
  const [visible, setVisible] = useState(false)
  const [newCharacters, setNewCharacters] = useState<TTSCharacter[]>([])
  const [newDialogues, setNewDialogues] = useState<TTSDialogue[]>([])

  useImperativeHandle(ref, () => ({
    open: (file: File) => {
      handleFile(file)
    },
  }))

  const handleFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      parseFile(text)
    }
    reader.readAsText(file)
  }

  const parseFile = (text: string) => {
    const lines = text.split(/\r?\n/)
    if (lines.length === 0) return

    const header = lines[0].split('\t')
    const idIdx = header.findIndex((h) => h.trim() === 'Identifier')
    const charIdx = header.findIndex((h) => h.trim() === 'Character')
    const diagIdx = header.findIndex((h) => h.trim() === 'Dialogue')

    if (idIdx === -1 || charIdx === -1 || diagIdx === -1) {
      Modal.error({
        title: '格式错误',
        content: '未找到 Identifier, Character 或 Dialogue 列',
      })
      return
    }

    const parsedDialogues: Array<{
      renpyId: string
      characterName: string
      content: string
    }> = []

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      if (!line.trim()) continue
      const cols = line.split('\t')
      const renpyId = cols[idIdx]?.trim()
      const characterName = cols[charIdx]?.trim() || '【旁白】'
      const content = cols[diagIdx]?.trim()

      if (renpyId && characterName && content) {
        parsedDialogues.push({ renpyId, characterName, content })
      }
    }

    const uniqueCharNames = Array.from(
      new Set(parsedDialogues.map((d) => d.characterName)),
    )
    const existingCharMap = new Map(characters.map((c) => [c.name, c]))

    const charsToAdd: TTSCharacter[] = []
    const charNameToId = new Map<string, string>()

    uniqueCharNames.forEach((name) => {
      if (existingCharMap.has(name)) {
        charNameToId.set(name, existingCharMap.get(name)!.id)
      } else {
        const newId = uuidv4()
        charNameToId.set(name, newId)
        charsToAdd.push({
          id: newId,
          name,
          voiceId: '', // Default empty voice
        })
      }
    })

    const dialoguesToAdd: TTSDialogue[] = parsedDialogues.map((d, index) => ({
      id: uuidv4(),
      characterId: charNameToId.get(d.characterName)!,
      content: d.content,
      createdAt: Date.now() + index,
      data: { renpyId: d.renpyId },
    }))

    setNewCharacters(charsToAdd)
    setNewDialogues(dialoguesToAdd)
    setVisible(true)
  }

  const handleOk = () => {
    onConfirm(newCharacters, newDialogues)
    setVisible(false)
  }

  const handleCancel = () => {
    setVisible(false)
  }

  const charColumns = [
    {
      title: '人物名称',
      dataIndex: 'name',
      key: 'name',
    },
  ]

  const diagColumns = [
    {
      title: 'Identifier (Renpy ID)',
      dataIndex: ['data', 'renpyId'],
      key: 'renpyId',
      width: 200,
    },
    {
      title: '人物',
      dataIndex: 'characterId',
      key: 'characterId',
      width: 150,
      render: (characterId: string) => {
        const char = [...characters, ...newCharacters].find(
          (c) => c.id === characterId,
        )
        return char ? char.name : characterId
      },
    },
    {
      title: '对话内容',
      dataIndex: 'content',
      key: 'content',
    },
  ]

  return (
    <Modal
      title="确认导入对话"
      open={visible}
      onOk={handleOk}
      onCancel={handleCancel}
      width={800}
      okText="确认导入"
      cancelText="取消"
    >
      <div className="max-h-[60vh] space-y-6 overflow-y-auto">
        {newCharacters.length > 0 && (
          <div>
            <h3 className="mb-2 text-lg font-bold text-slate-700">
              将新增以下人物：
            </h3>
            <Table
              columns={charColumns}
              dataSource={newCharacters}
              rowKey="id"
              pagination={false}
              size="small"
            />
          </div>
        )}
        <div>
          <h3 className="mb-2 text-lg font-bold text-slate-700">
            将新增以下对话：
          </h3>
          <Table
            columns={diagColumns}
            dataSource={newDialogues}
            rowKey="id"
            pagination={false}
            size="small"
          />
        </div>
      </div>
    </Modal>
  )
})
