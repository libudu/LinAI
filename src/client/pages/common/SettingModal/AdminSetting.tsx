import { Button, Checkbox, Divider, Form, Input, message, Radio, Tag } from 'antd'
import { hc } from 'hono/client'
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import type { AppType } from '../../../../server'
import { encryptApiKey } from '../../../../server/module/gpt-image/encrypt'
import { useLocalSetting } from '../../../hooks/useLocalSetting'

export interface AdminSettingRef {
  save: () => Promise<void>
}

const client = hc<AppType>('/')

function UserIdInput({
  value,
  onChange,
  onSave,
}: {
  value?: string
  onChange?: (v: string) => void
  onSave: () => void
}) {
  return (
    <div className="flex gap-2">
      <Input
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder="请输入云雾用户 ID"
        className="flex-1"
      />
      <Button type="primary" onClick={onSave}>
        保存
      </Button>
    </div>
  )
}

export const AdminSetting = forwardRef<AdminSettingRef>((_props, ref) => {
  const [form] = Form.useForm()
  const { yunwuSystemToken, setYunwuSystemToken, yunwuUserId, setYunwuUserId } =
    useLocalSetting()
  const [loading, setLoading] = useState(false)
  const [generatedApiKey, setGeneratedApiKey] = useState<string>('')

  const [rawApiKey, setRawApiKey] = useState('')
  const [encryptedApiKey, setEncryptedApiKey] = useState('')
  const [encrypting, setEncrypting] = useState(false)
  const [searchMode, setSearchMode] = useState<'keyword' | 'token'>('keyword')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [expandedId, setExpandedId] = useState<number | null>(null)

  useEffect(() => {
    form.setFieldsValue({
      yunwuSystemToken: yunwuSystemToken || '',
      name: '',
      quota: 10,
    })
  }, [yunwuSystemToken, form])

  useImperativeHandle(ref, () => ({
    save: async () => {
      const values = await form.validateFields()
      setYunwuSystemToken(values.yunwuSystemToken)
      setYunwuUserId(values.yunwuUserId)
    },
  }))

  const handleGenerate = async () => {
    try {
      const values = await form.validateFields()
      setLoading(true)
      setGeneratedApiKey('')

      const response = await client.api.gptImage['generate-api-key'].$post({
        json: {
          systemToken: values.yunwuSystemToken,
          userId: values.yunwuUserId,
          name: values.name,
          quota: Number(values.quota),
          group: '',
        },
      })
      const data = await response.json()

      if (data.success || data.data) {
        message.success('API Key 生成成功')
        setGeneratedApiKey(typeof data.data === 'string' ? data.data : '')
      } else {
        message.error(data.message || '生成失败')
      }
    } catch (error: any) {
      message.error(error.message || '请求失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveUserSettings = async () => {
    try {
      const values = await form.validateFields(['yunwuSystemToken', 'yunwuUserId'])
      setYunwuSystemToken(values.yunwuSystemToken)
      setYunwuUserId(values.yunwuUserId)
      message.success('云雾用户设置已保存')
    } catch {
      // 表单验证失败，antd 会自动显示提示
    }
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
    } catch (error: any) {
      message.error(error.message || '转换失败')
    } finally {
      setEncrypting(false)
    }
  }

  const handleSearch = async (value?: string) => {
    const kw = value ?? searchKeyword
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
      const data = await res.json()
      if (data.success) {
        setSearchResults(data.data || [])
        if ((data.data || []).length === 0) {
          message.info('未找到匹配的 API Key')
        }
      } else {
        message.error((data as any).error || '搜索失败')
      }
    } catch (error: any) {
      message.error(error.message || '搜索请求失败')
    } finally {
      setSearching(false)
    }
  }

  const handleToggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleToggleExpand = (id: number) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  return (
    <div className="px-4 py-2">
      {/* 云雾用户设置 */}
      <div className="mb-4 text-sm font-medium text-gray-800">
        云雾用户设置
      </div>
      <Form
        key={yunwuUserId ?? 'empty'}
        form={form}
        layout="vertical"
        initialValues={{
          yunwuSystemToken: yunwuSystemToken || '',
          yunwuUserId: yunwuUserId || '',
        }}
      >
        <Form.Item
          name="yunwuSystemToken"
          label="系统令牌"
          rules={[{ required: true, message: '请输入云雾系统令牌' }]}
        >
          <Input.Password placeholder="请输入云雾系统令牌" />
        </Form.Item>
        <Form.Item
          name="yunwuUserId"
          label="用户 ID"
          rules={[{ required: true, message: '请输入云雾用户 ID' }]}
        >
          <UserIdInput onSave={handleSaveUserSettings} />
        </Form.Item>

      <Divider />

      {/* API Key 搜索 */}
      <div className="mb-4 text-sm font-medium text-gray-800">
        API Key 搜索
      </div>
      <div className="flex gap-2">
        <Radio.Group
          value={searchMode}
          onChange={(e) => {
            setSearchMode(e.target.value)
            setSearchKeyword('')
            setSearchResults([])
          }}
          optionType="button"
          buttonStyle="solid"
        >
          <Radio.Button value="keyword">名称</Radio.Button>
          <Radio.Button value="token">Key</Radio.Button>
        </Radio.Group>
        <Input.Search
          className="flex-1"
          placeholder={searchMode === 'keyword' ? '搜索 API Key 名称' : '搜索 API Key 密钥 (sk-xxx)'}
          value={searchKeyword}
          onChange={(e) => {
            setSearchKeyword(e.target.value)
            if (e.target.value) handleSearch(e.target.value)
          }}
          onSearch={handleSearch}
          loading={searching}
          enterButton
        />
      </div>
      {searchResults.length > 0 && (
        <div className="mt-2 max-h-80 space-y-1 overflow-y-auto">
          {searchResults.map((item: any) => (
            <div
              key={item.id}
              className="rounded-md border border-slate-200"
            >
              <div className="flex items-center gap-2 px-3 py-2">
                <Checkbox
                  checked={selectedIds.has(item.id)}
                  onChange={() => handleToggleSelect(item.id)}
                />
                <span
                  className="flex-1 cursor-pointer text-sm"
                  onClick={() => handleToggleExpand(item.id)}
                >
                  {item.name}
                </span>
                <Tag color={item.status === 1 ? 'green' : 'red'}>
                  {item.status === 1 ? '启用' : '禁用'}
                </Tag>
                <Button
                  type="link"
                  size="small"
                  onClick={() => handleToggleExpand(item.id)}
                >
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

      <Divider />

      {/* API Key 生成 */}
      <div className="mb-4 text-sm font-medium text-gray-800">
        API Key 生成
      </div>
      <Form.Item name="name" label="API Key 标题">
        <Input placeholder="请输入 API Key 标题" />
      </Form.Item>
      <Form.Item label="限额 (RMB)">
        <div className="flex gap-2">
          <Form.Item name="quota" className="mb-0 flex-1" noStyle>
            <Input type="number" placeholder="请输入限额" />
          </Form.Item>
          <Button type="primary" onClick={handleGenerate} loading={loading}>
            生成 API Key
          </Button>
        </div>
      </Form.Item>
      </Form>
      {generatedApiKey && (
        <div className="mt-4 rounded-md border border-green-200 bg-green-50 p-4">
          <div className="mb-2 text-sm font-medium text-green-800">
            生成成功！请妥善保存您的 API Key：
          </div>
          <div className="flex items-center gap-2">
            <Input value={generatedApiKey} readOnly />
            <Button
              onClick={() => {
                navigator.clipboard.writeText(generatedApiKey)
                message.success('已复制到剪贴板')
              }}
            >
              复制
            </Button>
          </div>
        </div>
      )}

      <Divider />

      {/* API Key 加密转换 */}
      <div className="mb-4 text-sm font-medium text-gray-800">
        API Key 加密转换
      </div>
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
            <Button
              onClick={() => {
                navigator.clipboard.writeText(encryptedApiKey)
                message.success('已复制到剪贴板')
              }}
            >
              复制
            </Button>
          </div>
        </div>
      )}
    </div>
  )
})
