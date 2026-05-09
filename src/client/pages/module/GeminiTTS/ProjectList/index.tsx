import { Button, Col, Form, Input, Modal, Row, message } from 'antd'
import { hc } from 'hono/client'
import { useEffect, useState } from 'react'
import type { AppType } from '../../../../../server'
import { ProjectCard } from './ProjectCard'

const client = hc<AppType>('/')

interface ProjectListProps {
  onSelectProject: (project: any) => void
}

export const ProjectList = ({ onSelectProject }: ProjectListProps) => {
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<any>(null)
  const [form] = Form.useForm()

  const fetchProjects = async () => {
    setLoading(true)
    try {
      const response = await client.api['gemini-tts'].projects.$get()
      const data = await response.json()
      if (data.success) {
        setProjects(data.data)
      } else {
        message.error(data.error || '获取项目失败')
      }
    } catch (error: any) {
      message.error(error.message || '网络错误')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProjects()
  }, [])

  const handleCreateOrUpdateProject = async (values: any) => {
    try {
      let response;
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
        handleCloseModal()
        fetchProjects()
      } else {
        message.error(data.error || (editingProject ? '更新失败' : '创建失败'))
      }
    } catch (error: any) {
      message.error(error.message || '网络错误')
    }
  }

  const handleEdit = (project: any) => {
    setEditingProject(project)
    form.setFieldsValue({
      name: project.name,
      description: project.description,
    })
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setEditingProject(null)
    form.resetFields()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800">项目列表</h2>
        <Button type="primary" onClick={() => setIsModalOpen(true)}>
          新增项目
        </Button>
      </div>

      <div className={loading ? 'opacity-50' : ''}>
        <Row gutter={[16, 16]}>
          {projects.map((project) => (
            <Col xs={24} sm={12} md={8} lg={6} key={project.id}>
              <ProjectCard
                project={project}
                onSelectProject={onSelectProject}
                onUpdate={fetchProjects}
                onEdit={handleEdit}
              />
            </Col>
          ))}
        </Row>
      </div>

      <Modal
        title={editingProject ? "编辑项目" : "新增项目"}
        open={isModalOpen}
        onCancel={handleCloseModal}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={handleCreateOrUpdateProject}>
          <Form.Item
            name="name"
            label="项目名称"
            rules={[{ required: true, message: '请输入项目名称' }]}
          >
            <Input placeholder="请输入项目名称" />
          </Form.Item>
          <Form.Item name="description" label="项目描述">
            <Input.TextArea placeholder="请输入项目描述" rows={4} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
