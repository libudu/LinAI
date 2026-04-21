import { useState, useEffect } from 'react'
import { Modal, Form, Input, Button, message, Card, Spin, Tag, Space } from 'antd'
import { KeyOutlined, PictureOutlined } from '@ant-design/icons'
import { hc } from 'hono/client'
import type { AppType } from '../../../server/index'

const client = hc<AppType>('/')

interface GeminiModalProps {
  open: boolean
  onClose: () => void
}

export function GeminiModal({ open, onClose }: GeminiModalProps) {
  const [form] = Form.useForm()
  const [templates, setTemplates] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [generatedImages, setGeneratedImages] = useState<Record<string, string>>({})

  useEffect(() => {
    if (open) {
      const savedKey = localStorage.getItem('gemini_api_key')
      if (savedKey) {
        form.setFieldsValue({ apiKey: savedKey })
      }
      fetchTemplates()
    }
  }, [open])

  const fetchTemplates = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/task/templates')
      const data = await res.json()
      if (data.success) {
        const geminiTemplates = data.data.filter((t: any) => t.source === 'gemini-image')
        setTemplates(geminiTemplates)
      } else {
        message.error(data.error || '获取模板失败')
      }
    } catch (error) {
      message.error('获取模板失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveKey = () => {
    const values = form.getFieldsValue()
    if (!values.apiKey) {
      message.warning('请输入 API Key')
      return
    }
    localStorage.setItem('gemini_api_key', values.apiKey)
    message.success('API Key 保存成功')
  }

  const handleGenerate = async (templateId: string) => {
    const apiKey = form.getFieldValue('apiKey') || localStorage.getItem('gemini_api_key')
    if (!apiKey) {
      message.warning('请先配置 API Key')
      return
    }

    setGeneratingId(templateId)
    try {
      const res = await client.api.gemini.generate.$post({
        json: {
          apiKey,
          templateId
        }
      })
      const data = await res.json()
      if (data.success && 'image' in data && data.image) {
        message.success('生成成功')
        setGeneratedImages(prev => ({
          ...prev,
          [templateId]: data.image as string
        }))
      } else {
        message.error((data as any).error || '生成失败')
      }
    } catch (error) {
      message.error('请求失败')
    } finally {
      setGeneratingId(null)
    }
  }

  return (
    <Modal
      title="Gemini 图片生成"
      open={open}
      onCancel={onClose}
      footer={null}
      width={800}
      destroyOnClose
    >
      <div className="py-4 flex flex-col gap-6">
        <Card size="small" title={<span className="text-slate-600"><KeyOutlined className="mr-2" />API 配置</span>} className="shadow-sm border-slate-200">
          <Form form={form} layout="inline" className="flex items-center gap-2">
            <Form.Item name="apiKey" className="flex-1 mb-0">
              <Input.Password placeholder="输入 Gemini API Key" />
            </Form.Item>
            <Form.Item className="mb-0">
              <Button type="primary" onClick={handleSaveKey}>保存</Button>
            </Form.Item>
          </Form>
        </Card>

        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h4 className="text-md font-medium text-slate-800 m-0">Gemini 模板 ({templates.length})</h4>
            <Button size="small" onClick={fetchTemplates} loading={loading}>刷新</Button>
          </div>

          {loading ? (
            <div className="py-12 flex justify-center"><Spin /></div>
          ) : templates.length === 0 ? (
            <div className="py-12 text-center text-slate-400 bg-slate-50 rounded-xl border border-slate-100">
              <PictureOutlined className="text-4xl mb-2 text-slate-300" />
              <p>暂无 Gemini 模板，请先在左侧添加</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[500px] overflow-y-auto pr-2">
              {templates.map(item => (
                <Card key={item.id} size="small" className="shadow-sm border-slate-200 hover:shadow-md transition-shadow">
                  <div className="flex flex-col gap-3">
                    <div className="flex gap-3">
                      <div className="w-20 h-20 shrink-0 rounded-md overflow-hidden bg-slate-100 border border-slate-200 relative">
                        <img src={item.image} alt="template" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col">
                        <div className="flex justify-between items-start mb-1">
                          <Space size={[0, 4]} wrap>
                            <Tag color="green">{item.quality}</Tag>
                            <Tag color="orange">{item.aspectRatio}</Tag>
                          </Space>
                        </div>
                        <p className="text-sm text-slate-600 line-clamp-2 mt-1" title={item.prompt}>
                          {item.prompt}
                        </p>
                      </div>
                    </div>
                    
                    <div className="pt-2 border-t border-slate-100 flex justify-between items-center">
                      <span className="text-xs text-slate-400">
                        {new Date(item.createdAt).toLocaleString()}
                      </span>
                      <Button 
                        type="primary" 
                        size="small" 
                        icon={<PictureOutlined />}
                        loading={generatingId === item.id}
                        onClick={() => handleGenerate(item.id)}
                      >
                        生成
                      </Button>
                    </div>

                    {generatedImages[item.id] && (
                      <div className="mt-2 rounded-lg overflow-hidden border border-slate-200 relative group">
                        <div className="absolute top-1 left-1 bg-black/50 text-white text-xs px-2 py-1 rounded backdrop-blur-sm z-10">
                          生成结果
                        </div>
                        <img src={generatedImages[item.id]} alt="generated" className="w-full h-auto object-contain" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Button 
                            type="primary" 
                            ghost 
                            onClick={() => {
                              const a = document.createElement('a')
                              a.href = generatedImages[item.id]
                              a.download = `gemini-${item.id}.jpg`
                              a.click()
                            }}
                          >
                            下载图片
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
