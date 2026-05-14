import { useRequest } from 'ahooks'
import { Input, Table } from 'antd'
import { hc } from 'hono/client'
import { useState } from 'react'
import type { AppType } from '../../../../../../server'

const client = hc<AppType>('/')

export const VoiceList = () => {
  const [prefix, setPrefix] = useState('')

  const { data, loading } = useRequest(
    async () => {
      const res = await client.api['tts-ali'].voices.$get({
        query: { prefix },
      })
      const json = (await res.json()) as any
      if (json.success) {
        return json.data
      }
      throw new Error(json.error || '获取音色列表失败')
    },
    {
      refreshDeps: [prefix],
      debounceWait: 500,
    },
  )

  const columns = [
    {
      title: '音色名称',
      dataIndex: 'voice_name',
      key: 'voice_name',
    },
    // We can add more columns if the API returns more data (e.g. demo_audio, etc.)
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Input.Search
          placeholder="搜索音色名称前缀..."
          allowClear
          onChange={(e) => setPrefix(e.target.value)}
          style={{ width: 300 }}
        />
      </div>
      <Table
        dataSource={data || []}
        columns={columns}
        loading={loading}
        rowKey="voice_name"
        pagination={{ pageSize: 10 }}
      />
    </div>
  )
}
