import { useState } from 'react'
import { PlusOutlined, UploadOutlined } from '@ant-design/icons'
import { Form, Input, Radio, Select, Button, message, Upload } from 'antd'

interface TaskFormProps {
  onSuccess: () => void
}

export function TaskForm({ onSuccess }: TaskFormProps) {
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)
  const [imageUrl, setImageUrl] = useState<string>('')

  const handleFinish = async (values: any) => {
    if (!imageUrl) {
      message.warning('请上传图片')
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        ...values,
        image: imageUrl
      }

      const res = await fetch('/api/task/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const json = await res.json()

      if (json.success) {
        message.success('保存成功')
        form.resetFields()
        setImageUrl('')
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
      setImageUrl(e.target?.result as string)
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
          source: 'wan-video',
          quality: '1080p',
          aspectRatio: '16:9'
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
          >
            <Button icon={<UploadOutlined />}>选择图片</Button>
          </Upload>
          {imageUrl && (
            <div
              className="mt-4 rounded-lg overflow-hidden border border-slate-200"
              style={{ width: '120px', height: '120px' }}
            >
              <img
                src={imageUrl}
                alt="preview"
                className="w-full h-full object-cover"
              />
            </div>
          )}
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

        <div className="flex gap-4">
          <Form.Item
            name="quality"
            label="画质"
            className="flex-1"
            rules={[{ required: true }]}
          >
            <Select>
              <Select.Option value="720p">720p</Select.Option>
              <Select.Option value="1080p">1080p</Select.Option>
              <Select.Option value="2k">2K</Select.Option>
              <Select.Option value="4k">4K</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="aspectRatio"
            label="图片比例"
            className="flex-1"
            rules={[{ required: true }]}
          >
            <Select>
              <Select.Option value="16:9">16:9 (横屏)</Select.Option>
              <Select.Option value="9:16">9:16 (竖屏)</Select.Option>
              <Select.Option value="1:1">1:1 (正方形)</Select.Option>
              <Select.Option value="4:3">4:3</Select.Option>
            </Select>
          </Form.Item>
        </div>

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
