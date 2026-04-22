import { useState } from 'react'
import {
  PlusOutlined,
  UploadOutlined,
  QuestionCircleOutlined
} from '@ant-design/icons'
import {
  Form,
  Input,
  Radio,
  Button,
  message,
  Upload,
  Tooltip,
  Image
} from 'antd'
import { hc } from 'hono/client'
import type { AppType } from '../../../server'
import { GPTTokenModal } from '../GPTImageSection/GPTTokenModal'
import { useGlobalStore } from '../../store/global'

const client = hc<AppType>('/')

interface TemplateFormProps {
  onSuccess: () => void
}

export function TemplateForm({ onSuccess }: TemplateFormProps) {
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const usageType = Form.useWatch('usageType', form)
  const [trialGenerating, setTrialGenerating] = useState(false)
  const [trialImage, setTrialImage] = useState<string | null>(null)
  const [tokenModalOpen, setTokenModalOpen] = useState(false)
  const gptImageApiKey = useGlobalStore((state) => state.gptImageApiKey)

  const doTrial = async (apiKey: string) => {
    const prompt = form.getFieldValue('prompt')
    if (!prompt) {
      message.warning('请先填写提示词')
      return
    }

    setTrialGenerating(true)
    setTrialImage(null)
    try {
      const res = await client.api.gptImage.trial.$post({
        json: {
          apiKey,
          prompt
        }
      })
      const data = await res.json()
      if (data.success && 'image' in data && data.image) {
        message.success('生成试用图片成功')
        setTrialImage(data.image as string)
      } else {
        message.error((data as any).error || '生成失败')
      }
    } catch (error) {
      message.error('请求失败')
    } finally {
      setTrialGenerating(false)
    }
  }

  const handleTrial = () => {
    const prompt = form.getFieldValue('prompt')
    if (!prompt) {
      message.warning('请先填写提示词')
      return
    }

    const apiKey = gptImageApiKey
    if (!apiKey) {
      setTokenModalOpen(true)
      return
    }

    doTrial(apiKey)
  }

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
          usageType: 'video'
        }}
      >
        <div className="flex gap-4">
          <Form.Item
            name="usageType"
            label="模板用途"
            className="flex-1"
            rules={[{ required: true }]}
          >
            <Radio.Group
              optionType="button"
              buttonStyle="solid"
              className="w-full flex"
            >
              <Radio.Button value="video" className="flex-1 text-center">
                视频生成
              </Radio.Button>
              <Radio.Button value="image" className="flex-1 text-center">
                图片生成
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

        <Form.Item name="title" label="标题（可选）">
          <Input placeholder="请输入模板标题..." />
        </Form.Item>

        <Form.Item
          name="prompt"
          label={
            <div className="flex items-center gap-2">
              <span>提示词</span>
              {usageType === 'image' && (
                <div className="flex items-center gap-2">
                  <Button
                    size="small"
                    onClick={handleTrial}
                    loading={trialGenerating}
                    type="default"
                    className="border-purple-300 text-purple-600 hover:text-purple-500 hover:border-purple-400"
                  >
                    GPTImage2试用
                  </Button>
                  <Tooltip title="会使用 low quality 生成低质量图，仅消耗 1/10 价格（大约0.008元一张），可以用于最终生成效果的参考来调整提示词。">
                    <QuestionCircleOutlined className="text-slate-400 cursor-help" />
                  </Tooltip>
                </div>
              )}
            </div>
          }
          rules={[{ required: true, message: '请填写提示词' }]}
        >
          <Input.TextArea rows={4} placeholder="请输入生成内容的提示词..." />
        </Form.Item>

        {trialImage && (
          <div className="mb-4 p-4 bg-slate-50 rounded-lg border border-slate-100 flex flex-col items-center gap-2">
            <span className="text-sm text-slate-500">试用生成结果：</span>
            <Image
              src={trialImage}
              alt="trial-preview"
              className="rounded-lg shadow-sm"
              style={{ maxHeight: '200px', objectFit: 'contain' }}
            />
          </div>
        )}

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

      <GPTTokenModal
        open={tokenModalOpen}
        onClose={() => setTokenModalOpen(false)}
        onSuccess={(apiKey) => {
          doTrial(apiKey)
        }}
      />
    </div>
  )
}
