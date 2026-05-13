import { EditOutlined, DeleteOutlined, ExclamationCircleFilled } from '@ant-design/icons'
import { Card, Modal, Tooltip, message } from 'antd'
import { hc } from 'hono/client'
import type { AppType } from '../../../../../server'

const { confirm } = Modal
const client = hc<AppType>('/')

interface ProjectCardProps {
  project: any
  onSelectProject: (project: any) => void
  onUpdate: () => void
  onEdit: (project: any) => void
}

export const ProjectCard = ({ project, onSelectProject, onUpdate, onEdit }: ProjectCardProps) => {
  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    confirm({
      title: '确定要删除该项目吗？',
      icon: <ExclamationCircleFilled />,
      content: '删除后无法恢复',
      onOk: async () => {
        try {
          const response = await client.api.tts.projects[':id'].$delete({
            param: { id: project.id },
          })
          const data = await response.json()
          if (data.success) {
            message.success('删除成功')
            onUpdate()
          } else {
            message.error(data.error || '删除失败')
          }
        } catch (error: any) {
          message.error(error.message || '网络错误')
        }
      },
    })
  }

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    onEdit(project)
  }

  return (
    <Card
      hoverable
      className="h-full cursor-pointer relative group"
      onClick={() => onSelectProject(project)}
      actions={[
        <Tooltip title="编辑" key="edit">
          <EditOutlined onClick={handleEdit} />
        </Tooltip>,
        <Tooltip title="删除" key="delete">
          <DeleteOutlined onClick={handleDelete} className="text-red-500" />
        </Tooltip>,
      ]}
    >
      <Card.Meta
        title={project.name}
        description={
          <div className="line-clamp-2 text-slate-500 h-10">
            {project.backgroundPrompt || '暂无描述'}
          </div>
        }
      />
      <div className="mt-4 text-xs text-slate-400">
        {new Date(project.updatedAt).toLocaleString()}
      </div>
    </Card>
  )
}