import { EditOutlined } from '@ant-design/icons'
import { Button, Form, message, Modal, Tooltip } from 'antd'
import { hc } from 'hono/client'
import { useState } from 'react'
import type { AppType } from '../../../../server'
import { TaskTemplate } from '../../../../server/common/template-manager'
import { useTemplates } from '../../../hooks/useTemplates'
import { TemplateFormFields } from '../TemplateForm/TemplateFormItems'

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
      const res = await client.api.template[':id'].$put({
        param: { id: template.id },
        json: {
          ...values,
          images: imageUrls,
        },
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

  const handleSaveAs = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      const res = await client.api.template.$post({
        json: {
          title: values.title,
          prompt: values.prompt,
          aspectRatio: values.aspectRatio,
          folder: values.folder,
          usageType: template.usageType,
          images: imageUrls,
        },
      })
      const json = await res.json()
      if (json.success) {
        message.success('另存成功')
        refresh()
        handleClose()
      } else {
        message.error(json.error || '另存失败')
      }
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
          className="text-slate-500 hover:text-blue-600"
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
          />
        </Form>
      </Modal>
    </>
  )
}
