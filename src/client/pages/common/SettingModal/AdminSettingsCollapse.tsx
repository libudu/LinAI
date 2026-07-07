import { Button, Collapse, Form, Input, message, Radio, Tag } from 'antd'
import { useState } from 'react'
import { encryptApiKey } from '../../../../server/module/gpt-image/encrypt'
import type { ApiKeySearchResult } from './types'
interface Props {
  yunwuSystemToken?: string
  yunwuUserId?: string
  onGenerate: () => void
  loading: boolean
  onSelectToken?: (id: number | null) => void
}

export function AdminSettingsCollapse({ yunwuSystemToken, yunwuUserId, onGenerate, loading, onSelectToken }: Props) {
  const [searchMode, setSearchMode] = useState<'keyword' | 'token'>('keyword')
  const [searchResults, setSearchResults] = useState<ApiKeySearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const [rawApiKey, setRawApiKey] = useState('')
  const [encryptedApiKey, setEncryptedApiKey] = useState('')
  const [encrypting, setEncrypting] = useState(false)

  const [collapseKeys, setCollapseKeys] = useState<string[]>(['generate', 'encrypt'])

  const handleSearch = async (value?: string) => {
    const kw = (value || '').trim()
    if (!kw.trim()) return
    if (!yunwuSystemToken || !yunwuUserId) {
      message.warning('请先配置系统令牌和用户 ID')
      return
    }
    setSearching(true)
    try {
      const query: Record<string, string> = {}
      query[searchMode] = kw.trim()
      const res = await fetch(`/api/gptImage/search-api-keys?${new URLSearchParams(query)}`, {
        headers: {
          'x-system-token': yunwuSystemToken,
          'x-user-id': yunwuUserId,
        },
      })
      const data: Record<string, unknown> = await res.json()
      if (data.success) {
        const items = (data.data as ApiKeySearchResult[]) || []
        setSearchResults(items)
        if (items.length > 0) {
          setCollapseKeys((prev) => prev.includes('search') ? prev : [...prev, 'search'])
        } else {
          message.info('未找到匹配的 API Key')
        }
      } else {
        message.error((data.error as string) || '搜索失败')
      }
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '搜索请求失败')
    } finally {
      setSearching(false)
    }
  }

  const handleToggleSelect = (id: number) => {
    const next = selectedId === id ? null : id
    setSelectedId(next)
    onSelectToken?.(next)
  }

  const handleToggleExpand = (id: number) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  const handleEncrypt = async () => {
    if (!rawApiKey) {
      message.warning('请输入 API Key')
      return
    }
    setEncrypting(true)
    try {
      const result = encryptApiKey(rawApiKey)
      setEncryptedApiKey(result)
      message.success('转换成功')
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '转换失败')
    } finally {
      setEncrypting(false)
    }
  }

  const searchContent = (
    <>
      <div className="flex gap-2">
        <Radio.Group
          value={searchMode}
          onChange={(e) => { setSearchMode(e.target.value); setSearchResults([]) }}
          optionType="button"
          buttonStyle="solid"
        >
          <Radio.Button value="keyword">名称</Radio.Button>
          <Radio.Button value="token">Key</Radio.Button>
        </Radio.Group>
        <Input.Search
          className="flex-1"
          placeholder={searchMode === 'keyword' ? '搜索 API Key 名称' : '搜索 API Key 密钥 (sk-xxx)'}
          onSearch={handleSearch}
          loading={searching}
          enterButton
        />
      </div>
      {searchResults.length > 0 && (
        <div className="mt-2 max-h-80 space-y-1 overflow-y-auto">
          {searchResults.map((item) => (
            <div key={item.id} className="rounded-md border border-slate-200">
              <div className="flex items-center gap-2 px-3 py-2">
                <Radio checked={selectedId === item.id} onChange={() => handleToggleSelect(item.id)} />
                <span className="flex-1 cursor-pointer text-sm" onClick={() => handleToggleExpand(item.id)}>{item.name}</span>
                <Tag color={item.status === 1 ? 'green' : 'red'}>{item.status === 1 ? '启用' : '禁用'}</Tag>
                <Button type="link" size="small" onClick={() => handleToggleExpand(item.id)}>
                  {expandedId === item.id ? '收起' : '详情'}
                </Button>
              </div>
              {expandedId === item.id && (
                <div className="space-y-1 border-t border-slate-100 px-3 py-2 text-xs text-gray-500">
                  <div>Key: {item.key}</div>
                  <div>ID: {item.id}</div>
                  <div>分组: {item.group}</div>
                  <div>已用额度: {item.used_quota?.toLocaleString()}</div>
                  <div>剩余额度: {item.remain_quota?.toLocaleString()}</div>
                  <div>无限额度: {item.unlimited_quota ? '是' : '否'}</div>
                  <div>模型限制: {item.model_limits || '无'}</div>
                  <div>创建: {item.created_time ? new Date(item.created_time * 1000).toLocaleString() : '-'}</div>
                  <div>最后访问: {item.accessed_time ? new Date(item.accessed_time * 1000).toLocaleString() : '-'}</div>
                  <div>过期: {item.expired_time && item.expired_time > 0 ? new Date(item.expired_time * 1000).toLocaleString() : '永不过期'}</div>
                  <div>IP 限制: {item.allow_ips || '无'}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )

  const generateContent = (
    <>
      <Form.Item name="name" label="API Key 标题">
        <Input placeholder="请输入 API Key 标题" />
      </Form.Item>
      <Form.Item label="限额 (RMB)">
        <div className="flex gap-2">
          <Form.Item name="quota" className="mb-0 flex-1" noStyle>
            <Input type="number" placeholder="请输入限额" />
          </Form.Item>
          <Button type="primary" onClick={onGenerate} loading={loading}>
            生成 API Key
          </Button>
        </div>
      </Form.Item>
    </>
  )

  const encryptContent = (
    <>
      <div className="flex w-full gap-2">
        <Input
          placeholder="请输入 sk- 开头的 API Key"
          value={rawApiKey}
          onChange={(e) => setRawApiKey(e.target.value)}
          className="flex-1"
        />
        <Button loading={encrypting} onClick={handleEncrypt}>
          转换
        </Button>
      </div>
      {encryptedApiKey && (
        <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 p-4">
          <div className="mb-2 text-sm font-medium text-blue-800">
            转换成功！请复制加密后的 API Key：
          </div>
          <div className="flex items-center gap-2">
            <Input value={encryptedApiKey} readOnly />
            <Button onClick={() => { navigator.clipboard.writeText(encryptedApiKey); message.success('已复制到剪贴板') }}>
              复制
            </Button>
          </div>
        </div>
      )}
    </>
  )

  const items = [
    { key: 'search', label: `API Key 搜索${searchResults.length > 0 ? ` (${searchResults.length})` : ''}`, children: searchContent },
    { key: 'generate', label: 'API Key 生成', children: generateContent },
    { key: 'encrypt', label: 'API Key 加密转换', children: encryptContent },
  ]

  return (
    <Collapse
      ghost
      size="small"
      activeKey={collapseKeys}
      onChange={(keys) => setCollapseKeys(keys as string[])}
      items={items}
      className="[&_.ant-collapse-header]:!px-0 [&_.ant-collapse-content-box]:!px-0"
    />
  )
}
