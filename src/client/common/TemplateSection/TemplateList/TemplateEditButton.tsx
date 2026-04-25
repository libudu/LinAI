import { useState } from 'react'
import { Button, Modal, Form, Input, Select, message } from 'antd'
import { EditOutlined } from '@ant-design/icons'
import { hc } from 'hono/client'
import type { AppType } from '../../../../server'
import { TaskTemplate } from '../../../../server/common/template-manager'
import { useTemplates } from '../../../hooks/useTemplates'

const client = hc<AppType>('/')

interface TemplateEditButtonProps {
  template: TaskTemplate
}

export function TemplateEditButton({ template }: TemplateEditButtonProps) {
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()
  const { refresh } = useTemplates()

  const handleOpen = () => {
    form.setFieldsValue({
      title: template.title,
      prompt: template.prompt,
      aspectRatio: template.aspectRatio || '1:1'
    })
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
          aspectRatio: values.aspectRatio
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
      <Button
        type="text"
        icon={<EditOutlined />}
        onClick={handleOpen}
        className="text-slate-500 hover:text-blue-600"
      />
      <Modal
        title="编辑模板"
        open={open}
        onCancel={handleClose}
        onOk={() => form.submit()}
        confirmLoading={submitting}
        destroyOnClose
        okText="保存"
        cancelText="取消"
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleFinish}
          className="mt-4"
        >
          <Form.Item name="title" label="（可选）标题">
            <Input placeholder="请输入模板标题..." />
          </Form.Item>

          <Form.Item
            name="aspectRatio"
            label="比例"
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

          <Form.Item
            name="prompt"
            label="提示词"
            rules={[{ required: true, message: '请填写提示词' }]}
          >
            <Input.TextArea
              rows={5}
              placeholder="请输入生成内容的提示词..."
              style={{ resize: 'none' }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
