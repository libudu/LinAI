import { CopyOutlined, SyncOutlined } from '@ant-design/icons'
import { Button, Empty, Input, List, message, Tooltip } from 'antd'
import copy from 'copy-to-clipboard'
import { useMemo, useState } from 'react'
import { useGlobalStore } from '../../../../../store/global'
import { openSettingModal } from '../../../../common/SettingModal'
import { useTTSStore } from '../../store'
import { EditableRemark } from './EditableRemark'

export const VoiceList = () => {
  const [keyword, setKeyword] = useState('')
  const { ttsInworldApiKey } = useGlobalStore()
  const { voiceList, loadingVoiceList, fetchVoiceList, updateVoiceRemark } =
    useTTSStore()

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
        grid={{ gutter: 16, xs: 1, sm: 2, md: 2, lg: 3, xl: 4, xxl: 4 }}
        dataSource={data || []}
        loading={loadingVoiceList}
        pagination={{ pageSize: 12 }}
        renderItem={(item: any) => (
          <List.Item>
            <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4 pt-2 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex items-center justify-between gap-2">
                <span
                  className="truncate text-base leading-tight font-bold text-slate-800"
                  title={item.voiceId}
                >
                  {item.displayName || item.name}
                </span>
                <div className="flex shrink-0 items-center gap-1 text-base">
                  <Tooltip title="复制音色 ID">
                    <Button
                      type="text"
                      icon={<CopyOutlined />}
                      onClick={() => {
                        copy(item.voiceId)
                        message.success('复制成功')
                      }}
                      className="text-slate-400 hover:text-blue-600!"
                    />
                  </Tooltip>
                </div>
              </div>
              <div className="space-y-2 text-xs text-gray-500">
                <div>
                  <span className="font-medium text-gray-700">ID:</span>{' '}
                  {item.voiceId}
                </div>
                <div>
                  <span className="font-medium text-gray-700">语言:</span>{' '}
                  {item.langCode}
                </div>
                <div>
                  <span className="font-medium text-gray-700">性别:</span>{' '}
                  {item.gender}
                </div>
                <div>
                  <span className="font-medium text-gray-700">来源:</span>{' '}
                  {item.source}
                </div>
              </div>
              {item.description && (
                <div className="text-xs text-gray-500">
                  <span className="font-medium text-gray-700">描述:</span>{' '}
                  {item.description}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <EditableRemark
                  value={item.remark || ''}
                  onChange={(val) => updateVoiceRemark(item.voiceId, val)}
                />
              </div>
            </div>
          </List.Item>
        )}
      />
    </div>
  )
}
