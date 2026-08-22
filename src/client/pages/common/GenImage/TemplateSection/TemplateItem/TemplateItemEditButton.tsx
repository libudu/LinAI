import { FlatTemplate } from '@/shared/image/template'
import { EditOutlined } from '@ant-design/icons'
import { Button, Form, message, Modal, Tooltip } from 'antd'
import { useState } from 'react'
import { createTemplate, patchTemplate } from '../../service/templates'
import { useTemplates } from '../hooks/useTemplates'
import { TemplateFormFields } from '../TemplateForm/TemplateFormItems'

interface TemplateEditButtonProps {
  template: FlatTemplate
}

export function TemplateEditButton({ template }: TemplateEditButtonProps) {
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [uploadingCount, setUploadingCount] = useState(0)
  const [form] = Form.useForm()
  const { refresh } = useTemplates()

  const handleOpen = () => {
    form.setFieldsValue({
      title: template.title,
      prompt: template.prompt,
      aspectRatio: template.aspectRatio || '1:1',
      folder: template.folder,
      n: template.n || 1,
    })
    setImageUrls(template.images || [])
    setOpen(true)
  }

  const handleClose = () => {
    setOpen(false)
    form.resetFields()
  }

  const handleFinish = async (values: any) => {
    setSubmitting(true)
    try {
      await patchTemplate(template, { ...values, images: imageUrls })
      message.success('更新成功')
      refresh()
      handleClose()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '更新失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSaveAs = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      await createTemplate({
        title: values.title,
        prompt: values.prompt,
        aspectRatio: values.aspectRatio,
        folder: values.folder,
        images: imageUrls,
      })
      message.success('另存成功')
      refresh()
      handleClose()
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in error) {
        // Validation failed, do nothing
      } else {
        message.error('请求失败')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Tooltip title="编辑模板">
        <Button
          type="text"
          icon={<EditOutlined />}
          onClick={handleOpen}
          className="hover:text-blue-600!"
        />
      </Tooltip>
      <Modal
        title="编辑模板"
        open={open}
        onCancel={handleClose}
        footer={() => {
          return (
            <div className="flex justify-between">
              <Button
                key="saveAs"
                onClick={handleSaveAs}
                loading={submitting}
                disabled={uploadingCount > 0}
              >
                另存
              </Button>
              <div className="flex gap-4">
                <Button key="cancel" onClick={handleClose}>
                  取消
                </Button>
                <Button
                  key="submit"
                  type="primary"
                  onClick={() => form.submit()}
                  loading={submitting}
                  disabled={uploadingCount > 0}
                >
                  保存
                </Button>
              </div>
            </div>
          )
        }}
        destroyOnHidden
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleFinish}
          className="mt-4"
        >
          <TemplateFormFields
            form={form}
            imageUrls={imageUrls}
            setImageUrls={setImageUrls}
            setUploadingCount={setUploadingCount}
            isEdit
          />
        </Form>
      </Modal>
    </>
  )
}
