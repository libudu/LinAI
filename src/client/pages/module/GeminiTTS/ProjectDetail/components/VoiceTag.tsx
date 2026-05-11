import { Tag } from 'antd'
import { voiceList } from '../VoicePreview/voiceConfig'

interface VoiceTagProps {
  voiceName: string
  hideName?: boolean
}

export const VoiceTag = ({ voiceName, hideName }: VoiceTagProps) => {
  const voiceInfo = voiceList.find((v) => v.name === voiceName)

  if (!voiceInfo) {
    return <Tag color="blue">{voiceName}</Tag>
  }

  return (
    <div className="flex items-center gap-1">
      {!hideName && <Tag color="blue">{voiceInfo.name}</Tag>}
      <Tag color={voiceInfo.gender === '男' ? 'cyan' : 'magenta'}>
        {voiceInfo.gender}
      </Tag>
      <Tag color="lime">{voiceInfo.voice}</Tag>
    </div>
  )
}
