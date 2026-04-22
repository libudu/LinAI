import { useState } from 'react'
import { PlusOutlined, UploadOutlined } from '@ant-design/icons'
import { Form, Input, Radio, Button, message, Upload } from 'antd'
import { hc } from 'hono/client'
import type { AppType } from '../../../server'

const client = hc<AppType>('/')

interface TemplateFormProps {
  onSuccess: () => void
}

export function TemplateForm({ onSuccess }: TemplateFormProps) {
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)
  const [imageUrls, setImageUrls] = useState<string[]>([])

  const handleFinish = async (values: any) => {
    if (imageUrls.length === 0) {
      message.warning('请上传图片')
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        ...values,
        images: imageUrls
      }

      const res = await client.api.template.$post({ json: payload })
      const json = await res.json()

      if (json.success) {
        message.success('保存成功')
        form.resetFields()
        setImageUrls([])
        onSuccess()
      } else {
        message.error(json.error || '保存失败')
      }
    } catch (error) {
      message.error('请求失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpload = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      setImageUrls((prev) => [...prev, e.target?.result as string])
    }
    reader.readAsDataURL(file)
    return false // 阻止默认上传行为
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
      <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
        <PlusOutlined className="text-emerald-500" /> 新增模板
      </h3>
      <Form
        form={form}
        layout="vertical"
        onFinish={handleFinish}
        initialValues={{
          source: 'wan-video'
        }}
      >
        <div className="flex gap-4">
          <Form.Item
            name="source"
            label="模型来源"
            className="flex-1"
            rules={[{ required: true }]}
          >
            <Radio.Group
              optionType="button"
              buttonStyle="solid"
              className="w-full flex"
            >
              <Radio.Button value="wan-video" className="flex-1 text-center">
                Wan
              </Radio.Button>
              <Radio.Button value="gemini-image" className="flex-1 text-center">
                Gemini
              </Radio.Button>
            </Radio.Group>
          </Form.Item>
        </div>

        <Form.Item label="上传图片" required>
          <Upload
            accept="image/*"
            showUploadList={false}
            beforeUpload={handleUpload as any}
            multiple
          >
            <Button icon={<UploadOutlined />}>选择多张图片</Button>
          </Upload>
          {imageUrls.length > 0 && (
            <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
              {imageUrls.map((url, index) => (
                <div
                  key={index}
                  className="shrink-0 rounded-lg overflow-hidden border border-slate-200 shadow-sm bg-slate-100"
                  style={{ width: '80px', height: '120px' }}
                >
                  <img
                    src={url}
                    alt={`preview-${index}`}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          )}
        </Form.Item>

        <Form.Item
          name="title"
          label="标题（可选）"
        >
          <Input placeholder="请输入模板标题..." />
        </Form.Item>

        <Form.Item
          name="prompt"
          label="提示词"
          rules={[{ required: true, message: '请填写提示词' }]}
        >
          <Input.TextArea
            rows={4}
            placeholder="请输入生成内容的提示词..."
          />
        </Form.Item>

        <Form.Item className="mb-0 pt-4 border-t border-slate-100">
          <Button
            type="primary"
            htmlType="submit"
            loading={submitting}
            block
            size="large"
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            保存模板
          </Button>
        </Form.Item>
      </Form>
    </div>
  )
}
