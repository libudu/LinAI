import { Tag } from 'antd'
import { voiceList } from './voiceConfig'

interface VoiceTagProps {
  voiceName: string
}

export const VoiceTag = ({ voiceName }: VoiceTagProps) => {
  const voiceInfo = voiceList.find((v) => v.name === voiceName)

  if (!voiceInfo) {
    return <Tag color="blue">{voiceName}</Tag>
  }

  return (
    <div className="flex items-center gap-1">
      <Tag color="blue">{voiceInfo.name}</Tag>
      <Tag color={voiceInfo.gender === '男' ? 'cyan' : 'magenta'}>
        {voiceInfo.gender}
      </Tag>
      <Tag color="lime">{voiceInfo.voice}</Tag>
    </div>
  )
}
