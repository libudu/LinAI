import { createTemplate } from '@/client/service/image-templates'
import type { GptImageSize } from '@/shared/image/params'
import { PlusOutlined } from '@ant-design/icons'
import { Button, Form, message } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/shallow'
import { ImageGenerateDropdown } from '../../generation/ImageGenerateDropdown'
import { useImageGeneration } from '../../generation/useImageGeneration'
import { useTemplateDraftStore } from '../draftStore'
import { StyleExtractModal } from './StyleExtractModal'
import { TemplateFormFields } from './TemplateFormItems'
import { toTemplateValue, type TemplateFormValues } from './values'

export function TemplateForm() {
  const formRef = useRef<HTMLDivElement>(null)
  const [form] = Form.useForm<TemplateFormValues>()
  const [submitting, setSubmitting] = useState(false)
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [uploadingCount, setUploadingCount] = useState(0)
  const { trial } = useImageGeneration()
  const { fillTemplateData, setFillTemplateData } = useTemplateDraftStore(
    useShallow((state) => ({
      fillTemplateData: state.fillTemplateData,
      setFillTemplateData: state.setFillTemplateData,
    })),
  )
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

  const handleTrial = (size: GptImageSize) => {
    trial(
      {
        prompt: form.getFieldValue('prompt') || '',
        images: imageUrls,
        aspectRatio: form.getFieldValue('aspectRatio') || '1:1',
        n: form.getFieldValue('n') || 1,
      },
      size,
    )
  }

  const handleFinish = async (values: TemplateFormValues) => {
    setSubmitting(true)
    try {
      await createTemplate(toTemplateValue(values, imageUrls))
      message.success('保存成功')
      form.resetFields()
      setImageUrls([])
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
        {/* {styleExtractEnabled && (
          <Button
            type="link"
            size="small"
            icon={<ExperimentOutlined />}
            className="ml-auto"
            onClick={() => setOpenStyleExtractModal(true)}
          >
            图片风格提取
          </Button>
        )} */}
      </h3>
      <Form<TemplateFormValues>
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
