import {
  LoadingOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import { Button, Empty, Input, List, Tag, Tooltip, message } from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'
import { TTSCharacter } from '../../../../../../server/module/tts'
import { useGlobalStore } from '../../../../../store/global'
import { openSettingModal } from '../../../../common/SettingModal'
import { useTTSStore } from '../../store'
import { previewVoice } from '../generate'

export const inworldSourceMap: Record<string, string> = {
  IVC: '音色克隆',
}

export interface VoiceListProps {
  characters?: TTSCharacter[]
}

export const VoiceList = ({ characters = [] }: VoiceListProps) => {
  const [keyword, setKeyword] = useState('')
  const { ttsInworldApiKey } = useGlobalStore()
  const { voiceList, loadingVoiceList, fetchVoiceList } = useTTSStore()

  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
      }
    }
  }, [])

  const handlePreview = async (voiceId: string) => {
    if (playingId === voiceId) {
      audioRef.current?.pause()
      setPlayingId(null)
      return
    }

    try {
      setPlayingId(`${voiceId}_loading`)
      const url = await previewVoice(voiceId, ttsInworldApiKey || '')
      if (audioRef.current) {
        audioRef.current.pause()
      }
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => setPlayingId(null)
      await audio.play()
      setPlayingId(voiceId)
    } catch (e) {
      console.error(e)
      setPlayingId(null)
      message.error('试听失败')
    }
  }

  const data = useMemo(() => {
    if (!keyword) return voiceList
    const lowerKeyword = keyword.toLowerCase()
    return voiceList.filter((voice) => {
      const idMatch = voice.voiceId.toLowerCase().includes(lowerKeyword)
      const nameMatch = voice.name.toLowerCase().includes(lowerKeyword)
      const remarkMatch = voice.remark?.toLowerCase().includes(lowerKeyword)
      return idMatch || nameMatch || remarkMatch
    })
  }, [voiceList, keyword])

  if (!ttsInworldApiKey) {
    return (
      <div className="flex h-full items-center justify-center py-12">
        <Empty
          description="请先配置 Inworld API Key"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          <Button
            type="primary"
            onClick={() => openSettingModal({ initialTab: 'tts' })}
          >
            去配置
          </Button>
        </Empty>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Input.Search
          placeholder="搜索关键词..."
          allowClear
          onChange={(e) => setKeyword(e.target.value)}
          style={{ width: 300 }}
        />
        <Button
          icon={<SyncOutlined />}
          onClick={() => fetchVoiceList(ttsInworldApiKey)}
          loading={loadingVoiceList}
        >
          刷新列表
        </Button>
      </div>
      <List
        grid={{ gutter: 16, xs: 1, sm: 2, md: 3, lg: 3, xl: 4, xxl: 4 }}
        dataSource={data || []}
        loading={loadingVoiceList}
        renderItem={(item) => {
          const linkedCharacters = characters.filter(
            (c) => c.voiceId === item.voiceId,
          )
          return (
            <List.Item>
              <div className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-4 pt-2 shadow-sm transition-shadow hover:shadow-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-base leading-tight font-bold text-slate-800">
                      {item.displayName || item.name}
                    </span>
                    {item.source && (
                      <Tag color="green">
                        {inworldSourceMap[item.source] || item.source}
                      </Tag>
                    )}
                  </div>
                  <Button
                    type="text"
                    size="small"
                    className="shrink-0"
                    icon={
                      playingId === `${item.voiceId}_loading` ? (
                        <LoadingOutlined />
                      ) : playingId === item.voiceId ? (
                        <PauseCircleOutlined className="text-blue-500" />
                      ) : (
                        <PlayCircleOutlined />
                      )
                    }
                    onClick={() => handlePreview(item.voiceId)}
                  />
                </div>
                <div className="flex gap-2">
                  <span className="shrink-0">Voice ID:</span>
                  <Tooltip title={item.voiceId}>
                    <span className="line-clamp-1 break-all">
                      {item.voiceId}
                    </span>
                  </Tooltip>
                </div>
                {item.description && (
                  <div className="text-xs text-gray-500">
                    <span className="font-medium text-gray-700">描述:</span>{' '}
                    {item.description}
                  </div>
                )}
                {linkedCharacters.length > 0 && (
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <span className="font-medium text-gray-700">关联人物:</span>{' '}
                    {linkedCharacters.map((c) => (
                      <Tag key={c.id} color="purple">
                        {c.name}
                      </Tag>
                    ))}
                  </div>
                )}
              </div>
            </List.Item>
          )
        }}
      />
    </div>
  )
}
