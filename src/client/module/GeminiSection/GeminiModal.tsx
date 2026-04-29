import { KeyOutlined, PictureOutlined } from '@ant-design/icons'
import {
  Button,
  Card,
  Form,
  Input,
  message,
  Modal,
  Space,
  Spin,
  Tag
} from 'antd'
import { hc } from 'hono/client'
import { useEffect, useMemo, useState } from 'react'
import type { AppType } from '../../../server/index'
import { useTemplates } from '../../hooks/useTemplates'

const client = hc<AppType>('/')

interface GeminiModalProps {
  open: boolean
  onClose: () => void
}

export function GeminiModal({ open, onClose }: GeminiModalProps) {
  const [form] = Form.useForm()
  const {
    data: allTemplates = [],
    loading,
    refresh: fetchTemplates
  } = useTemplates()

  const templates = useMemo(() => {
    return allTemplates.filter((t) => t.usageType === 'image')
  }, [allTemplates])

  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [generatedImages, setGeneratedImages] = useState<
    Record<string, string>
  >({})

  useEffect(() => {
    if (open) {
      const savedKey = localStorage.getItem('gemini_api_key')
      if (savedKey) {
        form.setFieldsValue({ apiKey: savedKey })
      }
      fetchTemplates()
    }
  }, [open, fetchTemplates])

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
    const apiKey =
      form.getFieldValue('apiKey') || localStorage.getItem('gemini_api_key')
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
        setGeneratedImages((prev) => ({
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
      destroyOnHidden
    >
      <div className="flex flex-col gap-6 py-4">
        <Card
          size="small"
          title={
            <span className="text-slate-600">
              <KeyOutlined className="mr-2" />
              API 配置
            </span>
          }
          className="border-slate-200 shadow-sm"
        >
          <Form form={form} layout="inline" className="flex items-center gap-2">
            <Form.Item name="apiKey" className="mb-0 flex-1">
              <Input.Password placeholder="输入 Gemini API Key" />
            </Form.Item>
            <Form.Item className="mb-0">
              <Button type="primary" onClick={handleSaveKey}>
                保存
              </Button>
            </Form.Item>
          </Form>
        </Card>

        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h4 className="text-md m-0 font-medium text-slate-800">
              Gemini 模板 ({templates.length})
            </h4>
            <Button size="small" onClick={fetchTemplates} loading={loading}>
              刷新
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Spin />
            </div>
          ) : templates.length === 0 ? (
            <div className="rounded-xl border border-slate-100 bg-slate-50 py-12 text-center text-slate-400">
              <PictureOutlined className="mb-2 text-4xl text-slate-300" />
              <p>暂无 Gemini 模板，请先在左侧添加</p>
            </div>
          ) : (
            <div className="grid max-h-[500px] grid-cols-1 gap-4 overflow-y-auto pr-2 md:grid-cols-2">
              {templates.map((item) => (
                <Card
                  key={item.id}
                  size="small"
                  className="border-slate-200 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex gap-3">
                      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                        {item.images && item.images.length > 0 && (
                          <img
                            src={item.images[0]}
                            alt="template"
                            className="h-full w-full object-cover"
                          />
                        )}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <div className="mb-1 flex items-start justify-between">
                          <Space size={[0, 4]} wrap>
                            <Tag color="blue">图片模板</Tag>
                          </Space>
                        </div>
                        <p
                          className="mt-1 line-clamp-2 text-sm text-slate-600"
                          title={item.prompt}
                        >
                          {item.prompt}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-100 pt-2">
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
                      <div className="group relative mt-2 overflow-hidden rounded-lg border border-slate-200">
                        <div className="absolute top-1 left-1 z-10 rounded bg-black/50 px-2 py-1 text-xs text-white backdrop-blur-sm">
                          生成结果
                        </div>
                        <img
                          src={generatedImages[item.id]}
                          alt="generated"
                          className="h-auto w-full object-contain"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
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
