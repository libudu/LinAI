import { EditOutlined } from '@ant-design/icons'
import { Button, Form, message, Modal, Tooltip } from 'antd'
import { hc } from 'hono/client'
import { useState } from 'react'
import type { AppType } from '../../../../server'
import { TaskTemplate } from '../../../../server/common/template-manager'
import { useTemplates } from '../../../hooks/useTemplates'
import { TemplateFormFields } from '../TemplateForm'

const client = hc<AppType>('/')

interface TemplateEditButtonProps {
  template: TaskTemplate
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
      folder: template.folder
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
      const res = await client.api.template[':id'].$put({
        param: { id: template.id },
        json: {
          title: values.title,
          prompt: values.prompt,
          aspectRatio: values.aspectRatio,
          folder: values.folder,
          images: imageUrls
        }
      })
      const json = await res.json()
      if (json.success) {
        message.success('更新成功')
        refresh()
        handleClose()
      } else {
        message.error(json.error || '更新失败')
      }
    } catch (error) {
      message.error('请求失败')
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
          className="text-slate-500 hover:text-blue-600"
        />
      </Tooltip>
      <Modal
        title="编辑模板"
        open={open}
        onCancel={handleClose}
        onOk={() => form.submit()}
        confirmLoading={submitting || uploadingCount > 0}
        destroyOnClose
        okText="保存"
        cancelText="取消"
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
          />
        </Form>
      </Modal>
    </>
  )
}
