import { DeleteOutlined, EditOutlined } from '@ant-design/icons'
import { Button, Tooltip } from 'antd'
import { GeminiTTSCharacter } from '../../../../../../server/module/gemini-tts'
import { VoiceTag } from '../components/VoiceTag'

interface CharacterCardProps {
  character: GeminiTTSCharacter
  onEdit: (character: GeminiTTSCharacter) => void
  onDelete: (id: string) => void
}

export const CharacterCard = ({
  character,
  onEdit,
  onDelete,
}: CharacterCardProps) => {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4 pt-2 shadow-sm transition-shadow hover:shadow-md">
      {/* 第一行：标题与操作按钮 */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-base leading-tight font-bold text-slate-800">
          {character.name}
        </span>
        <div className="flex shrink-0 items-center gap-1 text-base">
          <Tooltip title="编辑">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => onEdit(character)}
              className="text-slate-400 hover:text-blue-600!"
            />
          </Tooltip>
          <Tooltip title="删除">
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={() => onDelete(character.id)}
              className="text-slate-400 hover:text-red-600!"
            />
          </Tooltip>
        </div>
      </div>

      {/* 第二行：标签 */}
      <VoiceTag voiceName={character.voiceName} />

      {/* 第三行：描述 */}
      <div className="mt-1 line-clamp-1 text-xs text-slate-500">
        {character.voicePrompt || '暂无描述'}
      </div>
    </div>
  )
}
