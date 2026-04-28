import { LoadingOutlined, PlusOutlined } from '@ant-design/icons'
import { useLocalStorageState } from 'ahooks'
import { Button, Form, Image, Input, message, Radio, Select } from 'antd'
import { hc } from 'hono/client'
import { useRef, useState } from 'react'
import type { AppType } from '../../../../server'
import { openSettingModal } from '../../../common/SettingModal'
import { useLocalSetting } from '../../../hooks/useLocalSetting'
import { useGlobalStore } from '../../../store/global'

import type { GptImageSize } from '../../../../server/module/gpt-image/enum'
import { useTasks } from '../../../hooks/useTasks'
import { FolderFormItem } from './FolderSelectInput'
import { ImageUpload } from './ImageUpload'

const client = hc<AppType>('/')

export function TitleFormItem({ className }: { className?: string }) {
  return (
    <Form.Item name="title" label="（可选）标题" className={className}>
      <Input placeholder="请输入模板标题..." />
    </Form.Item>
  )
}

export function AspectRatioFormItem({ className }: { className?: string }) {
  return (
    <Form.Item
      name="aspectRatio"
      label="比例"
      className={className}
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
  )
}

export function PromptFormItem({
  className,
  label = '提示词'
}: {
  className?: string
  label?: React.ReactNode
}) {
  return (
    <Form.Item
      name="prompt"
      label={label}
      className={className}
      rules={[{ required: true, message: '请填写提示词' }]}
    >
      <Input.TextArea
        rows={5}
        placeholder="请输入生成内容的提示词..."
        style={{ resize: 'none' }}
      />
    </Form.Item>
  )
}

export function TemplateFormFields({
  form,
  imageUrls,
  setImageUrls,
  setUploadingCount
}: {
  form: any
  imageUrls: string[]
  setImageUrls: (urls: string[]) => void
  setUploadingCount: (count: number) => void
}) {
  return (
    <>
      <div className="flex gap-4">
        <TitleFormItem className="flex-1" />
        <FolderFormItem className="w-1/4" />
      </div>

      <div className="flex gap-4">
        <Form.Item label="上传图片" className="flex-1">
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
        <AspectRatioFormItem className="w-1/4" />
      </div>

      <PromptFormItem
        label={
          <div className="flex items-center gap-2">
            <span>提示词</span>
          </div>
        }
      />
    </>
  )
}

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
  const gptImageApiKey = useGlobalStore((state) => state.gptImageApiKey)
  const { gptImageSettings } = useLocalSetting()
  const { refresh } = useTasks()
  const trialRequestIdRef = useRef(0)

  const doTrial = async (size: GptImageSize) => {
    const prompt = form.getFieldValue('prompt')
    if (!prompt) {
      message.warning('请先填写提示词')
      return
    }
    const aspectRatio = form.getFieldValue('aspectRatio') || '1:1'

    const currentRequestId = ++trialRequestIdRef.current

    setTrialGenerating(true)
    setTrialImage(null)

    message.success('任务提交成功')
    setTimeout(() => refresh(), 500)
    try {
      const res = await client.api.gptImage.trial.$post({
        json: {
          prompt,
          aspectRatio,
          images: imageUrls,
          size,
          quality: gptImageSettings.quality
        }
      })

      if (currentRequestId !== trialRequestIdRef.current) return

      const data = await res.json()

      if (currentRequestId !== trialRequestIdRef.current) return

      if (data.success) {
        setTrialImage(data.outputUrl)
      } else {
        message.error(data.error || '生成失败')
      }
    } catch (error) {
      if (currentRequestId !== trialRequestIdRef.current) return
      message.error('请求失败')
    } finally {
      if (currentRequestId === trialRequestIdRef.current) {
        setTrialGenerating(false)
      }
      refresh()
    }
  }

  const handleTrial = (size: GptImageSize) => {
    const prompt = form.getFieldValue('prompt')
    if (!prompt) {
      message.warning('请先填写提示词')
      return
    }

    const apiKey = gptImageApiKey
    if (!apiKey) {
      openSettingModal({
        initialTab: 'gpt-image',
        onSuccess: () => {
          doTrial(size)
        }
      })
      return
    }

    doTrial(size)
  }

  const handleFinish = async (values: any) => {
    setTrialImage(null)
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
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-800">
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
            className="flex w-full"
          >
            <Radio.Button value="image" className="flex-1 text-center">
              图片生成
            </Radio.Button>
            <Radio.Button disabled value="video" className="flex-1 text-center">
              视频生成
            </Radio.Button>
          </Radio.Group>
        </Form.Item>

        <TemplateFormFields
          form={form}
          imageUrls={imageUrls}
          setImageUrls={setImageUrls}
          setUploadingCount={setUploadingCount}
        />

        {(trialImage || trialGenerating) && (
          <div className="group relative mb-4 flex flex-col items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 p-4">
            <span className="text-sm text-slate-500">试用生成结果：</span>
            {trialGenerating ? (
              <div className="flex h-[200px] w-full flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-slate-400">
                <LoadingOutlined className="mb-2 text-3xl" />
                <span className="text-sm">正在生成中...</span>
              </div>
            ) : trialImage ? (
              <div className="relative">
                <Image
                  src={trialImage}
                  alt="trial-preview"
                  className="rounded-lg shadow-sm"
                  style={{ maxHeight: '150px', objectFit: 'contain' }}
                />
              </div>
            ) : null}
          </div>
        )}

        <Form.Item className="mb-0! border-t border-slate-100 pt-4">
          <div className="flex gap-4">
            {usageType === 'image' && gptImageSettings.enable1K && (
              <Button
                onClick={() => handleTrial('1k')}
                disabled={uploadingCount > 0}
                size="large"
                className="grow border-purple-300 text-purple-600 hover:border-purple-400 hover:text-purple-500"
              >
                生成1K图
              </Button>
            )}
            {usageType === 'image' && gptImageSettings.enable2K && (
              <Button
                onClick={() => handleTrial('2k')}
                disabled={uploadingCount > 0}
                size="large"
                className="grow border-purple-300 text-purple-600 hover:border-purple-400 hover:text-purple-500"
              >
                生成2K图
              </Button>
            )}
            <Button
              type="primary"
              htmlType="submit"
              loading={submitting}
              disabled={uploadingCount > 0}
              block={usageType !== 'image'}
              className="grow-2 bg-emerald-600 hover:bg-emerald-700"
              size="large"
            >
              保存模板
            </Button>
          </div>
        </Form.Item>
      </Form>
    </div>
  )
}
