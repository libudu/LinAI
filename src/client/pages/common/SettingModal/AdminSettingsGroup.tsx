import { AutoComplete, Button, Checkbox, Collapse, Divider, Input, message, Radio, Tag } from 'antd'
import { useState } from 'react'

interface TokenData {
  id: number
  name: string
  group: string
  routing_priority: string
  key: string
  remain_quota: number
  expired_time: number
  unlimited_quota: boolean
  model_limits_enabled: boolean
  model_limits: string
  allow_ips: string
  used_quota: number
  mj_image_mode: string
  mj_custom_proxy: string
  selected_groups: string[]
  status: number
  created_time: number
  accessed_time: number
  [key: string]: unknown
}

interface Props {
  yunwuSystemToken?: string
  yunwuUserId?: string
  selectedTokenId: number | null
}

const ROUTING_OPTIONS = [
  { value: 'auto', label: '智能自动', desc: '综合价格、速度、成功率自动选择' },
  { value: 'price', label: '价格优先', desc: '优先选择成本更低的渠道' },
  { value: 'speed', label: '速度优先', desc: '优先选择响应更快的渠道' },
  { value: 'success_rate', label: '成功率优先', desc: '优先选择近期更稳定的渠道' },
]

export function AdminSettingsGroup({ yunwuSystemToken, yunwuUserId, selectedTokenId }: Props) {
  const [tokenData, setTokenData] = useState<TokenData | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [routingPriority, setRoutingPriority] = useState('')
  const [manualMode, setManualMode] = useState(false)
  const [groups, setGroups] = useState<string[]>([])
  const [newGroupName, setNewGroupName] = useState('')
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [availableGroups, setAvailableGroups] = useState<{ name: string; description: string; ratio: number }[]>([])

  const handleFetch = async () => {
    if (!selectedTokenId || !yunwuSystemToken || !yunwuUserId) {
      message.warning('请先在 API Key 搜索中选中一个令牌')
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/gptImage/token-info/${selectedTokenId}`, {
        headers: {
          'x-system-token': yunwuSystemToken,
          'x-user-id': yunwuUserId,
        },
      })
      const result: Record<string, unknown> = await res.json()
      if (result.success) {
        const data = result.data as TokenData
        setTokenData(data)
        setRoutingPriority(data.routing_priority || '')
        setGroups(data.group ? data.group.split(',').filter(Boolean) : [])
        setManualMode(false)
        handleFetchGroups()
      } else {
        message.error((result.error as string) || '获取令牌信息失败')
      }
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '请求失败')
    } finally {
      setLoading(false)
    }
  }

  const handleFetchGroups = async () => {
    if (!yunwuSystemToken || !yunwuUserId) return
    try {
      const res = await fetch('/api/gptImage/user-groups', {
        headers: {
          'x-system-token': yunwuSystemToken,
          'x-user-id': yunwuUserId,
        },
      })
      const result: Record<string, unknown> = await res.json()
      if (result.success) {
        const data = result.data as Record<string, unknown>
        const groupsMap = data.data as Record<string, string> || {}
        const ratiosMap = data.ratios as Record<string, number> || {}
        const list = Object.entries(groupsMap).map(([name, description]) => ({
          name,
          description,
          ratio: ratiosMap[name] ?? 0,
        }))
        setAvailableGroups(list)
      }
    } catch {
      // 静默失败，下拉框不出现即可
    }
  }

  const handleSave = async () => {
    if (!tokenData || !yunwuSystemToken || !yunwuUserId) return
    setSaving(true)
    try {
      const payload = {
        ...tokenData,
        routing_priority: manualMode ? '' : routingPriority,
        group: manualMode ? groups.join(',') : '',
        id: tokenData.id,
      }
      const res = await fetch('/api/gptImage/token-update', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          'x-system-token': yunwuSystemToken,
          'x-user-id': yunwuUserId,
        },
        body: JSON.stringify(payload),
      })
      const result: Record<string, unknown> = await res.json()
      if (result.success) {
        message.success('分组设置已保存')
      } else {
        message.error((result.error as string) || '保存失败')
      }
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '保存请求失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDragStart = (index: number) => {
    setDragIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (dragIndex === null || dragIndex === index) return
    const newGroups = [...groups]
    const [moved] = newGroups.splice(dragIndex, 1)
    newGroups.splice(index, 0, moved)
    setGroups(newGroups)
    setDragIndex(index)
  }

  const handleDragEnd = () => {
    setDragIndex(null)
  }

  const handleDeleteGroup = (index: number) => {
    setGroups((prev) => prev.filter((_, i) => i !== index))
  }

  const handleAddGroup = () => {
    const name = newGroupName.trim()
    if (!name) return
    if (groups.includes(name)) {
      message.warning('该分组已存在')
      return
    }
    setGroups((prev) => [...prev, name])
    setNewGroupName('')
  }

  const items = [
    {
      key: 'group',
      label: 'API Key 分组设置',
      children: (
        <>
          <div className="mb-3 flex items-center gap-2">
            <Tag color={selectedTokenId ? 'blue' : 'default'}>
              {selectedTokenId ? `已选中: #${selectedTokenId}` : '未选中令牌'}
            </Tag>
            <Button onClick={handleFetch} loading={loading} size="small">
              获取
            </Button>
          </div>

          {tokenData && (
            <>
              <div className="mb-1 text-xs text-gray-500">
                当前令牌: {tokenData.name} ({tokenData.key.substring(0, 12)}...)
              </div>

              <Divider className="my-3!" />

              {!manualMode && (
                <>
                  <div className="mb-2 text-sm font-medium text-gray-700">
                    智能路由
                  </div>
                  <Radio.Group
                    value={routingPriority}
                    onChange={(e) => setRoutingPriority(e.target.value)}
                  >
                    <div className="space-y-2">
                      {ROUTING_OPTIONS.map((opt) => (
                        <div
                          key={opt.value}
                          className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-gray-50"
                          onClick={() => setRoutingPriority(opt.value)}
                        >
                          <Radio value={opt.value} />
                          <div>
                            <div className="text-sm">{opt.label}</div>
                            <div className="text-xs text-gray-400">{opt.desc}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Radio.Group>
                </>
              )}

              <Checkbox
                checked={manualMode}
                onChange={(e) => setManualMode(e.target.checked)}
              >
                关闭智能路由，手动选分组
              </Checkbox>

              {manualMode && (
                <div className="mt-3 space-y-2">
                  {groups.map((group, index) => (
                    <div
                      key={`${group}-${index}`}
                      className={`flex items-center gap-2 rounded-md border px-3 py-2 ${
                        dragIndex === index ? 'border-blue-400 bg-blue-50' : 'border-slate-200'
                      }`}
                      draggable
                      onDragStart={() => handleDragStart(index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDragEnd={handleDragEnd}
                    >
                      <span className="cursor-grab text-xs text-gray-400">⠿</span>
                      <span className="mr-1 text-xs text-gray-400">#{index + 1}</span>
                      <span className="flex-1 text-sm">{group}</span>
                      <Button
                        type="text"
                        size="small"
                        danger
                        onClick={() => handleDeleteGroup(index)}
                      >
                        删除
                      </Button>
                    </div>
                  ))}
                  {groups.length === 0 && (
                    <div className="py-2 text-center text-xs text-gray-400">
                      暂无分组，请添加
                    </div>
                  )}
                  <AutoComplete
                    value={newGroupName}
                    onChange={setNewGroupName}
                    className="w-full!"
                    popupClassName="!min-w-[360px]"
                    options={availableGroups
                      .filter((g) => g.name.toLowerCase().includes(newGroupName.toLowerCase()))
                      .map((g) => ({
                        value: g.name,
                        label: (
                          <div className="flex flex-col gap-0.5 py-1">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">{g.name}</span>
                              <span
                                className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${
                                  g.ratio <= 1
                                    ? 'border-green-200 bg-green-50 text-green-600'
                                    : g.ratio <= 4
                                      ? 'border-blue-200 bg-blue-50 text-blue-600'
                                      : g.ratio <= 8
                                        ? 'border-orange-200 bg-orange-50 text-orange-600'
                                        : 'border-red-200 bg-red-50 text-red-600'
                                }`}
                              >
                                {g.ratio}x
                              </span>
                            </div>
                            <div className="text-xs text-gray-400">{g.description}</div>
                          </div>
                        ),
                      }))}
                    filterOption={false}
                    onSelect={(value: string) => {
                      if (!groups.includes(value)) {
                        setGroups((prev) => [...prev, value])
                      }
                      setNewGroupName('')
                    }}
                  >
                    <Input.Search
                      placeholder="输入或选择分组名称"
                      onSearch={handleAddGroup}
                      enterButton="添加"
                      size="small"
                    />
                  </AutoComplete>
                </div>
              )}

              <Divider className="my-3!" />

              <Button type="primary" onClick={handleSave} loading={saving} block>
                保存分组设置
              </Button>
            </>
          )}
        </>
      ),
    },
  ]

  return (
    <Collapse
      ghost
      size="small"
      defaultActiveKey={['group']}
      items={items}
      className="[&_.ant-collapse-header]:!px-0 [&_.ant-collapse-content-box]:!px-0"
    />
  )
}
