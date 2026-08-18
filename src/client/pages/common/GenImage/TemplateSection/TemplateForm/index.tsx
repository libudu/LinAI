import { useLocalSetting } from '@/client/hooks/useLocalSetting'
import { useGlobalStore } from '@/client/store/global'
import type { AppType } from '@/server'
import type { GptImageSize } from '@/server/module/gpt-image/enum'
import { ExperimentOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Form, message } from 'antd'
import { hc } from 'hono/client'
import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/shallow'
import { ImageGenerateDropdown } from '../../components/ImageGenerateDropdown'
import { createTemplate } from '../../service/templates'
import { openGPTImageSettingModal } from '../../SettingModal'
import { useGptImageStore } from '../../store'
import { StyleExtractModal } from './StyleExtractModal'
import { TemplateFormFields } from './TemplateFormItems'

const client = hc<AppType>('/')

interface TemplateFormProps {
  onSuccess: () => void
}

export function TemplateForm({ onSuccess }: TemplateFormProps) {
  const formRef = useRef<HTMLDivElement>(null)
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [uploadingCount, setUploadingCount] = useState(0)
  const gptImageApiKey = useGptImageStore((state) => state.gptImageApiKey)
  const { fillTemplateData, setFillTemplateData } = useGlobalStore(
    useShallow((state) => ({
      fillTemplateData: state.fillTemplateData,
      setFillTemplateData: state.setFillTemplateData,
    })),
  )
  const { gptImageSettings, appendAspectRatio, styleExtractEnabled } =
    useLocalSetting()
  const [openStyleExtractModal, setOpenStyleExtractModal] = useState(false)

  // 触发填入模板数据
  useEffect(() => {
    if (fillTemplateData) {
      form.setFieldsValue({
        title: fillTemplateData.title,
        folder: fillTemplateData.folder,
        aspectRatio: fillTemplateData.aspectRatio,
        n: fillTemplateData.n,
        prompt: fillTemplateData.prompt,
      })
      if (fillTemplateData.images) {
        setImageUrls(fillTemplateData.images)
      }
      setFillTemplateData(null)

      setTimeout(() => {
        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    }
  }, [fillTemplateData, form])

  const doTrial = async (size: GptImageSize) => {
    const prompt = form.getFieldValue('prompt')
    const n = form.getFieldValue('n') || 1
    if (!prompt) {
      message.warning('请先填写提示词')
      return
    }
    const aspectRatio = form.getFieldValue('aspectRatio') || '1:1'

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
          appendAspectRatio,
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
      openGPTImageSettingModal({
        initialTab: 'endpoint',
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
      await createTemplate({
        ...values,
        images: imageUrls,
      })
      message.success('保存成功')
      form.resetFields()
      setImageUrls([])
      onSuccess()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-800">
        <PlusOutlined className="text-emerald-500" /> 新增模板
        {styleExtractEnabled && (
          <Button
            type="link"
            size="small"
            icon={<ExperimentOutlined />}
            className="ml-auto"
            onClick={() => setOpenStyleExtractModal(true)}
          >
            图片风格提取
          </Button>
        )}
      </h3>
      <Form
        form={form}
        layout="vertical"
        onFinish={handleFinish}
        initialValues={{
          aspectRatio: '1:1',
          n: 1,
        }}
      >
        <div ref={formRef} />
        <TemplateFormFields
          form={form}
          imageUrls={imageUrls}
          setImageUrls={setImageUrls}
          setUploadingCount={setUploadingCount}
        />
        <Form.Item className="mb-0! border-t border-slate-100 pt-4">
          <div className="flex flex-wrap gap-4">
            <div className="min-w-0 flex-1">
              <ImageGenerateDropdown
                onGenerate={handleTrial}
                disabled={uploadingCount > 0}
                size="large"
                block
              />
            </div>
            <Button
              type="primary"
              htmlType="submit"
              loading={submitting}
              disabled={uploadingCount > 0}
              block={false}
              className="min-w-32 grow"
              size="large"
            >
              保存模板
            </Button>
          </div>
        </Form.Item>
      </Form>
      <StyleExtractModal
        open={openStyleExtractModal}
        onClose={() => setOpenStyleExtractModal(false)}
        onApply={(composedPrompt) => {
          form.setFieldsValue({ prompt: composedPrompt })
          setOpenStyleExtractModal(false)
        }}
      />
    </>
  )
}
