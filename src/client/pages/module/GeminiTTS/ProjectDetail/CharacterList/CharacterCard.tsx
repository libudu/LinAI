import {
  AudioOutlined,
  DeleteOutlined,
  EditOutlined,
  MessageOutlined,
} from '@ant-design/icons'
import { Button, Tooltip } from 'antd'
import classNames from 'classnames'
import { TTSCharacter } from '../../../../../../server/module/tts'
import { useTTSStore } from '../../store'

interface CharacterCardProps {
  character: TTSCharacter
  dialoguesCount: number
  onEdit: (character: TTSCharacter) => void
  onDelete: (id: string) => void
}

export const CharacterCard = ({
  character,
  dialoguesCount,
  onEdit,
  onDelete,
}: CharacterCardProps) => {
  const { voiceList } = useTTSStore()
  const voice = voiceList.find((v) => v.voiceId === character.voiceId)
  const voiceName = voice?.displayName

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-4 pt-2 shadow-sm transition-shadow hover:shadow-md">
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

      {/* 第二行：信息展示 */}
      <div className="flex flex-col gap-1 text-sm text-gray-500">
        <div className="flex items-center gap-2">
          <AudioOutlined className="text-gray-400" />
          <span className="flex gap-1 truncate">
            <span>分配音色:</span>
            <span
              className={classNames({
                'text-red-500': !voiceName,
              })}
            >
              {voiceName || '未知音色'}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <MessageOutlined className="text-gray-400" />
          <span className="flex gap-1 truncate">
            <span>关联对话:</span>
            <span>{dialoguesCount} 条</span>
          </span>
        </div>
      </div>
    </div>
  )
}
