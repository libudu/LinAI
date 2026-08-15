import { Form, Input, Modal, message } from 'antd'
import { useEffect } from 'react'
import {
  createProject,
  updateProject,
  type TTSProjectListItem,
} from './service/projects'

interface ProjectModalProps {
  open: boolean
  editingProject?: TTSProjectListItem | null
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
          description: editingProject.description,
        })
      } else {
        form.resetFields()
      }
    }
  }, [open, editingProject, form])

  const handleCreateOrUpdateProject = async (values: any) => {
    try {
      if (editingProject) {
        await updateProject(editingProject.id, values)
      } else {
        await createProject(values)
      }
      message.success(editingProject ? '更新成功' : '创建成功')
      onSuccess()
      onClose()
    } catch (error: any) {
      message.error(error.message || (editingProject ? '更新失败' : '创建失败'))
    }
  }

  return (
    <Modal
      title={editingProject ? '编辑项目' : '新增项目'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      destroyOnHidden
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
        <Form.Item name="description" label="项目描述">
          <Input.TextArea
            placeholder="请输入项目描述"
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
