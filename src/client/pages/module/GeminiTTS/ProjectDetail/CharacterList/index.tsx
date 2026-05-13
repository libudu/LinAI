import { ExclamationCircleFilled, PlusOutlined } from '@ant-design/icons'
import { Button, Modal } from 'antd'
import { useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { TTSCharacter } from '../../../../../../server/module/tts'
import { CharacterCard } from './CharacterCard'
import { CharacterModal, CharacterModalRef } from './CharacterModal'

const { confirm } = Modal

interface CharacterListProps {
  backgroundPrompt: string
  characters: TTSCharacter[]
  onUpdateCharacters: (characters: TTSCharacter[]) => void
}

export const CharacterList = ({
  backgroundPrompt,
  characters = [],
  onUpdateCharacters,
}: CharacterListProps) => {
  const modalRef = useRef<CharacterModalRef>(null)

  const handleOpenModal = (character?: TTSCharacter) => {
    modalRef.current?.open(character)
  }

  const handleSave = (
    characterData: Omit<TTSCharacter, 'id'> | TTSCharacter,
  ) => {
    let newCharacters
    if ('id' in characterData) {
      newCharacters = characters.map((c) =>
        c.id === characterData.id ? { ...c, ...characterData } : c,
      )
    } else {
      newCharacters = [...characters, { id: uuidv4(), ...characterData }]
    }

    onUpdateCharacters(newCharacters)
  }

  const handleDelete = (id: string) => {
    confirm({
      title: '确定要删除该人物吗？',
      icon: <ExclamationCircleFilled />,
      content: '删除后，已使用该人物的对话将无法生成语音。',
      onOk: () => {
        const newCharacters = characters.filter((c) => c.id !== id)
        onUpdateCharacters(newCharacters)
      },
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-700">人物列表</h3>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => handleOpenModal()}
        >
          添加人物
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {characters.map((character) => (
          <CharacterCard
            key={character.id}
            character={character}
            onEdit={handleOpenModal}
            onDelete={handleDelete}
          />
        ))}
        {characters.length === 0 && (
          <div className="col-span-full rounded-lg border border-dashed border-slate-200 bg-slate-50 py-8 text-center text-slate-400">
            暂无人物，请先添加人物
          </div>
        )}
      </div>

      <CharacterModal
        ref={modalRef}
        onSave={handleSave}
        backgroundPrompt={backgroundPrompt}
      />
    </div>
  )
}
