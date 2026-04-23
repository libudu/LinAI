import { useState } from 'react'
import { useLocalStorageState } from 'ahooks'
import { PlusOutlined, DownloadOutlined } from '@ant-design/icons'
import { Form, Input, Radio, Button, message, Image, Select } from 'antd'
import { hc } from 'hono/client'
import type { AppType } from '../../../server'
import { GPTTokenModal } from '../GPTImageSection/GPTTokenModal'
import { useGlobalStore } from '../../store/global'

import { ImageUpload } from './ImageUpload'

const client = hc<AppType>('/')

interface TemplateFormProps {
  onSuccess: () => void
}

export function TemplateForm({ onSuccess }: TemplateFormProps) {
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [uploadingCount, setUploadingCount] = useState(0)
  const [localUsageType, setLocalUsageType] = useLocalStorageState<
    'image' | 'video'
  >('template-usage-type', {
    defaultValue: 'image'
  })
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
    const aspectRatio = form.getFieldValue('aspectRatio') || '1:1'

    setTrialGenerating(true)
    setTrialImage(null)
    try {
      const res = await client.api.gptImage.trial.$post({
        json: {
          apiKey,
          prompt,
          aspectRatio,
          images: imageUrls
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
          usageType: localUsageType,
          aspectRatio: '1:1'
        }}
        onValuesChange={(changedValues) => {
          if (changedValues.usageType) {
            setLocalUsageType(changedValues.usageType)
          }
        }}
      >
        <Form.Item
          name="usageType"
          label="模板用途"
          rules={[{ required: true }]}
        >
          <Radio.Group
            optionType="button"
            buttonStyle="solid"
            className="w-full flex"
          >
            <Radio.Button value="image" className="flex-1 text-center">
              图片生成
            </Radio.Button>
            <Radio.Button value="video" className="flex-1 text-center">
              视频生成
            </Radio.Button>
          </Radio.Group>
        </Form.Item>

        <div className="flex gap-4">
          <Form.Item name="title" label="（可选）标题" className="flex-1">
            <Input placeholder="请输入模板标题..." />
          </Form.Item>

          <Form.Item
            name="aspectRatio"
            label="比例"
            className="w-1/3"
            rules={[{ required: true, message: '请选择比例' }]}
          >
            <Select
              options={[
                { label: '21:9', value: '21:9' },
                { label: '2:1', value: '2:1' },
                { label: '16:9', value: '16:9' },
                { label: '4:3', value: '4:3' },
                { label: '1:1', value: '1:1' },
                { label: '3:4', value: '3:4' },
                { label: '9:16', value: '9:16' },
                { label: '1:2', value: '1:2' },
                { label: '9:21', value: '9:21' }
              ]}
            />
          </Form.Item>
        </div>

        <Form.Item label="上传图片">
          <ImageUpload
            value={imageUrls}
            onChange={setImageUrls}
            onUploadingChange={(isUploading) =>
              setUploadingCount(isUploading ? 1 : 0)
            }
            onFirstImageRatio={(ratio) => {
              form.setFieldsValue({ aspectRatio: ratio })
            }}
          />
        </Form.Item>

        <Form.Item
          name="prompt"
          label={
            <div className="flex items-center gap-2">
              <span>提示词</span>
            </div>
          }
          rules={[{ required: true, message: '请填写提示词' }]}
        >
          <Input.TextArea
            rows={5}
            placeholder="请输入生成内容的提示词..."
            style={{ resize: 'none' }}
          />
        </Form.Item>

        {trialImage && (
          <div className="mb-4 p-4 bg-slate-50 rounded-lg border border-slate-100 flex flex-col items-center gap-2 relative group">
            <span className="text-sm text-slate-500">试用生成结果：</span>
            <div className="relative">
              <Image
                src={trialImage}
                alt="trial-preview"
                className="rounded-lg shadow-sm"
                style={{ maxHeight: '200px', objectFit: 'contain' }}
              />
              <Button
                icon={<DownloadOutlined />}
                size="small"
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => {
                  const link = document.createElement('a')
                  link.href = trialImage
                  link.download = 'trial-image.png'
                  document.body.appendChild(link)
                  link.click()
                  document.body.removeChild(link)
                }}
              />
            </div>
          </div>
        )}

        <Form.Item className="mb-0 pt-4 border-t border-slate-100">
          <div className="flex gap-4">
            {usageType === 'image' && (
              <Button
                onClick={handleTrial}
                loading={trialGenerating}
                disabled={uploadingCount > 0}
                size="large"
                className="grow border-purple-300 text-purple-600 hover:text-purple-500 hover:border-purple-400"
              >
                生成1k图测试
                <span className="text-xs text-gray-400">(保存模板后2k)</span>
              </Button>
            )}
            <Button
              type="primary"
              htmlType="submit"
              loading={submitting}
              disabled={uploadingCount > 0}
              block={usageType !== 'image'}
              className="grow bg-emerald-600 hover:bg-emerald-700"
              size="large"
            >
              保存模板
            </Button>
          </div>
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
