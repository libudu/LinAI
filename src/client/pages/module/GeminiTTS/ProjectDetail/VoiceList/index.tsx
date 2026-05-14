import { CopyOutlined, SyncOutlined } from '@ant-design/icons'
import { Button, Empty, Input, List, Tooltip } from 'antd'
import copy from 'copy-to-clipboard'
import { useMemo, useState } from 'react'
import { useGlobalStore } from '../../../../../store/global'
import { openSettingModal } from '../../../../common/SettingModal'
import { useTTSStore } from '../../store'

export const VoiceList = () => {
  const [prefix, setPrefix] = useState('')
  const { ttsAliApiKey } = useGlobalStore()
  const { voiceList, loadingVoiceList, fetchVoiceList } = useTTSStore()

  const data = useMemo(() => {
    if (!prefix) return voiceList
    return voiceList.filter((voice) =>
      voice.voice_id.toLowerCase().includes(prefix.toLowerCase()),
    )
  }, [voiceList, prefix])

  if (!ttsAliApiKey) {
    return (
      <div className="flex h-full items-center justify-center py-12">
        <Empty
          description="请先配置阿里云 DashScope API Key"
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
          placeholder="搜索音色名称前缀..."
          allowClear
          onChange={(e) => setPrefix(e.target.value)}
          style={{ width: 300 }}
        />
        <Button
          icon={<SyncOutlined />}
          onClick={() => fetchVoiceList(ttsAliApiKey)}
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
                  title={item.voice_id}
                >
                  {item.voice_id}
                </span>
                <div className="flex shrink-0 items-center gap-1 text-base">
                  <Tooltip title="复制音色 ID">
                    <Button
                      type="text"
                      icon={<CopyOutlined />}
                      onClick={() => copy(item.voice_id)}
                      className="text-slate-400 hover:text-blue-600!"
                    />
                  </Tooltip>
                </div>
              </div>
              <div className="space-y-2 text-xs text-gray-500">
                <div>
                  <span className="font-medium text-gray-700">模型:</span>{' '}
                  {item.target_model}
                </div>
                <div>
                  <span className="font-medium text-gray-700">状态:</span>{' '}
                  {item.status || 'UNKNOWN'}
                </div>
                <div>
                  <span className="font-medium text-gray-700">创建时间:</span>{' '}
                  {item.gmt_create}
                </div>
                <div>
                  <span className="font-medium text-gray-700">更新时间:</span>{' '}
                  {item.gmt_modified}
                </div>
              </div>
            </div>
          </List.Item>
        )}
      />
    </div>
  )
}
