import { PlusOutlined } from '@ant-design/icons'
import { useLocalStorageState } from 'ahooks'
import { Button, Form, message, Radio } from 'antd'
import { hc } from 'hono/client'
import { useState } from 'react'
import type { AppType } from '../../../../server'
import type { GptImageSize } from '../../../../server/module/gpt-image/enum'
import { openSettingModal } from '../../../common/SettingModal'
import { useLocalSetting } from '../../../hooks/useLocalSetting'
import { useGlobalStore } from '../../../store/global'
import { TemplateFormFields } from './TemplateFormItems'

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
    defaultValue: 'image',
  })
  const usageType = Form.useWatch('usageType', form)
  const gptImageApiKey = useGlobalStore((state) => state.gptImageApiKey)
  const { gptImageSettings } = useLocalSetting()
  const [hasTrialed, setHasTrialed] = useState(false)

  const doTrial = async (size: GptImageSize) => {
    const prompt = form.getFieldValue('prompt')
    const n = form.getFieldValue('n') || 1
    if (!prompt) {
      message.warning('请先填写提示词')
      return
    }
    const aspectRatio = form.getFieldValue('aspectRatio') || '1:1'

    setHasTrialed(true)
    message.success('任务提交成功')
    try {
      const res = await client.api.gptImage.trial.$post({
        json: {
          prompt,
          aspectRatio,
          images: imageUrls,
          size,
          quality: gptImageSettings.quality,
          n,
        },
      })

      const data = await res.json()

      if (!data.success) {
        message.error(data.error || '生成失败')
      }
    } catch (error) {
      message.error('请求失败')
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
        },
      })
      return
    }

    doTrial(size)
  }

  const handleFinish = async (values: any) => {
    setSubmitting(true)
    try {
      const payload = {
        ...values,
        images: imageUrls,
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
          aspectRatio: '1:1',
          n: 1,
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

        <Form.Item className="mb-0! border-t border-slate-100 pt-4">
          <div className="flex gap-4">
            {usageType === 'image' && gptImageSettings.enable1K && (
              <Button
                onClick={() => handleTrial('1k')}
                disabled={uploadingCount > 0}
                size="large"
                className="grow border-purple-300 text-purple-600 hover:border-purple-400 hover:text-purple-500"
              >
                {hasTrialed ? '继续生成1K图' : '生成1K图'}
              </Button>
            )}
            {usageType === 'image' && gptImageSettings.enable2K && (
              <Button
                onClick={() => handleTrial('2k')}
                disabled={uploadingCount > 0}
                size="large"
                className="grow border-purple-300 text-purple-600 hover:border-purple-400 hover:text-purple-500"
              >
                {hasTrialed ? '继续生成2K图' : '生成2K图'}
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
