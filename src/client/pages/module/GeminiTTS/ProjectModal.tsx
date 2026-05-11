import { Form, Input, Modal, message } from 'antd'
import { hc } from 'hono/client'
import { useEffect } from 'react'
import type { AppType } from '../../../../server'

const client = hc<AppType>('/')

interface ProjectModalProps {
  open: boolean
  editingProject?: any
  onClose: () => void
  onSuccess: () => void
}

export const ProjectModal = ({
  open,
  editingProject,
  onClose,
  onSuccess,
}: ProjectModalProps) => {
  const [form] = Form.useForm()

  useEffect(() => {
    if (open) {
      if (editingProject) {
        form.setFieldsValue({
          name: editingProject.name,
          backgroundPrompt: editingProject.backgroundPrompt,
        })
      } else {
        form.resetFields()
      }
    }
  }, [open, editingProject, form])

  const handleCreateOrUpdateProject = async (values: any) => {
    try {
      let response
      if (editingProject) {
        response = await client.api['gemini-tts'].projects[':id'].$put({
          param: { id: editingProject.id },
          json: values,
        })
      } else {
        response = await client.api['gemini-tts'].projects.$post({
          json: values,
        })
      }

      const data = await response.json()
      if (data.success) {
        message.success(editingProject ? '更新成功' : '创建成功')
        onSuccess()
        onClose()
      } else {
        message.error(data.error || (editingProject ? '更新失败' : '创建失败'))
      }
    } catch (error: any) {
      message.error(error.message || '网络错误')
    }
  }

  return (
    <Modal
      title={editingProject ? '编辑项目' : '新增项目'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleCreateOrUpdateProject}
      >
        <Form.Item
          name="name"
          label="项目名称"
          rules={[{ required: true, message: '请输入项目名称' }]}
        >
          <Input placeholder="请输入项目名称" />
        </Form.Item>
        <Form.Item name="backgroundPrompt" label="故事背景">
          <Input.TextArea
            placeholder="请输入故事背景"
            autoSize={{
              minRows: 1,
              maxRows: 4,
            }}
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}
