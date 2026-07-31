import { Button, Collapse, Input, message, Radio, Tag } from 'antd'
import { KeyOutlined, LockOutlined } from '@ant-design/icons'
import { useState } from 'react'
import type { ApiKeySearchResult } from './types'
import { AdminSettingsGroup } from './AdminSettingsGroup'

interface Props {
  yunwuSystemToken?: string
  yunwuUserId?: string
  onGenerate: (name: string, quota: number, group: string) => void
  loading: boolean
}

export function AdminSettingsCollapse({
  yunwuSystemToken,
  yunwuUserId,
  onGenerate,
  loading,
}: Props) {
  const configured = !!(yunwuSystemToken && yunwuUserId)

  // Search state
  const [searchMode, setSearchMode] = useState<'keyword' | 'token'>('keyword')
  const [searchResults, setSearchResults] = useState<ApiKeySearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  // Collapse state
  const [collapseKeys, setCollapseKeys] = useState<string[]>([])
  // Generate form state
  const [genName, setGenName] = useState('')
  const [genQuota, setGenQuota] = useState(0)

  const handleSearch = async (value?: string) => {
    const kw = (value || '').trim()
    if (!kw) return
    if (!yunwuSystemToken || !yunwuUserId) {
      message.warning('请先配置系统令牌和用户 ID')
      return
    }
    setSearching(true)
    try {
      const query: Record<string, string> = {}
      query[searchMode] = kw
      const res = await fetch(
        `/api/gptImage/search-api-keys?${new URLSearchParams(query)}`,
        {
          headers: {
            'x-system-token': yunwuSystemToken,
            'x-user-id': yunwuUserId,
          },
        },
      )
      const data: Record<string, unknown> = await res.json()
      if (data.success) {
        // data.data may be an array (results) or { success, message } (nested API error)
        const payload = data.data as Record<string, unknown>
        if (payload && !Array.isArray(payload) && payload.success === false) {
          setSearchResults([])
          message.error((payload.message as string) || '搜索失败')
        } else {
          const items = (data.data as ApiKeySearchResult[]) || []
          setSearchResults(items)
          if (items.length > 0) {
            setCollapseKeys((prev) => {
              const arr = prev ?? []
              return arr.includes('search') ? arr : [...arr, 'search']
            })
          } else {
            message.info((data.message as string) || '未找到匹配的 API Key')
          }
        }
      } else {
        message.error((data.message as string) || '搜索失败')
      }
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '搜索请求失败')
    } finally {
      setSearching(false)
    }
  }

  const handleToggleSelect = (id: number) => {
    setSelectedId((prev) => (prev === id ? null : id))
  }

  const handleToggleExpand = (id: number) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  // Search panel content
  const searchContent = (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Radio.Group
          value={searchMode}
          onChange={(e) => setSearchMode(e.target.value)}
          size="small"
        >
          <Radio.Button value="keyword">关键词</Radio.Button>
          <Radio.Button value="token">Token</Radio.Button>
        </Radio.Group>
        <Input.Search
          placeholder={searchMode === 'keyword' ? '输入关键词搜索' : '输入 Token 搜索'}
          allowClear
          enterButton="搜索"
          onSearch={handleSearch}
          loading={searching}
          className="flex-1"
        />
      </div>

      {searchResults.length > 0 && (
        <div className="space-y-2">
          {searchResults.map((item) => (
            <div
              key={item.id}
              className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs"
            >
              <div className="mb-1 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Tag
                    color={item.status === 1 ? 'green' : 'default'}
                    className="!m-0 !text-[10px]"
                  >
                    {item.status === 1 ? '启用' : '禁用'}
                  </Tag>
                  <span className="font-medium text-gray-800">{item.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="small"
                    type={selectedId === item.id ? 'primary' : 'default'}
                    onClick={() => handleToggleSelect(item.id)}
                    className="!text-xs"
                  >
                    {selectedId === item.id ? '取消' : '选择'}
                  </Button>
                  <Button
                    size="small"
                    type="link"
                    onClick={() => handleToggleExpand(item.id)}
                    className="!text-xs"
                  >
                    {expandedId === item.id ? '收起' : '详情'}
                  </Button>
                </div>
              </div>
              {expandedId === item.id && (
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-gray-500">
                  <div>
                    ID: <span className="text-gray-700">{item.id}</span>
                  </div>
                  <div>
                    分组: <span className="text-gray-700">{item.group || '-'}</span>
                  </div>
                  <div>
                    已用配额:{' '}
                    <span className="text-gray-700">{item.used_quota}</span>
                  </div>
                  <div>
                    剩余配额:{' '}
                    <span className="text-gray-700">{item.remain_quota}</span>
                  </div>
                  <div>
                    创建时间:{' '}
                    <span className="text-gray-700">
                      {new Date(item.created_time * 1000).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    过期时间:{' '}
                    <span className="text-gray-700">
                      {item.expired_time
                        ? new Date(item.expired_time * 1000).toLocaleString()
                        : '永久'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )

  // Generate panel content
  const generateContent = (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-gray-500">
        使用当前配置的云雾用户凭据，在系统中生成一个新的 API Key。
      </p>
      <div>
        <div className="mb-1 text-xs text-gray-500">名称</div>
        <Input
          placeholder="例：my-api-key"
          value={genName}
          onChange={(e) => setGenName(e.target.value)}
        />
      </div>
      <div>
        <div className="mb-1 text-xs text-gray-500">
          限额（百万 Token，0 = 无限制）
        </div>
        <Input
          type="number"
          min={0}
          placeholder="输入额度数值"
          value={genQuota}
          onChange={(e) => setGenQuota(Number(e.target.value) || 0)}
          suffix={<span className="text-xs text-gray-400">百万</span>}
        />
      </div>
      <Button
        onClick={() => onGenerate(genName, genQuota, '')}
        loading={loading}
        icon={<KeyOutlined />}
        disabled={!genName.trim()}
      >
        生成新的 API Key
      </Button>
    </div>
  )

  const items = [
    {
      key: 'generate',
      label: '生成',
      children: generateContent,
    },
    {
      key: 'search',
      label: `搜索${searchResults.length > 0 ? ` (${searchResults.length})` : ''}`,
      children: searchContent,
    },
    {
      key: 'group',
      label: '分组设置',
      children: (
        <AdminSettingsGroup
          yunwuSystemToken={yunwuSystemToken}
          yunwuUserId={yunwuUserId}
          selectedTokenId={selectedId}
        />
      ),
    },
  ]

  return (
    <div className="relative overflow-hidden rounded-lg border border-gray-200 bg-white">
      {/* Gating overlay */}
      {!configured && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg bg-white/70 backdrop-blur-[1px] transition-all">
          <LockOutlined className="mb-2 text-2xl text-gray-300" />
          <div className="text-sm text-gray-400">请先完成上方云雾用户设置</div>
        </div>
      )}

      <div className={!configured ? 'pointer-events-none select-none' : ''}>
        {/* Card header */}
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3">
          <KeyOutlined className="text-base text-gray-400" />
          <span className="text-sm font-medium text-gray-700">API Key 管理</span>
        </div>

        {/* Collapse panels */}
        <div className="px-2 py-1">
          <Collapse
            ghost
            size="small"
            activeKey={collapseKeys}
            onChange={(keys) => setCollapseKeys(keys as string[])}
            items={items}
            className="[&_.ant-collapse-header]:!px-3 [&_.ant-collapse-content-box]:!px-3"
          />
        </div>
      </div>
    </div>
  )
}
