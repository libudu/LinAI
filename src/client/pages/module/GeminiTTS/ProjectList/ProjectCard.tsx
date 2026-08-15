import {
  DeleteOutlined,
  EditOutlined,
  ExclamationCircleFilled,
} from '@ant-design/icons'
import { Card, Modal, Tooltip, message } from 'antd'
import { deleteProject, type TTSProjectListItem } from '../service/projects'
import { useTTSStore } from '../store'

const { confirm } = Modal

interface ProjectCardProps {
  project: TTSProjectListItem
  onUpdate: () => void
  onEdit: (project: TTSProjectListItem) => void
}

export const ProjectCard = ({
  project,
  onUpdate,
  onEdit,
}: ProjectCardProps) => {
  const { setSelectedProjectId } = useTTSStore()

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    confirm({
      title: '确定要删除该项目吗？',
      icon: <ExclamationCircleFilled />,
      content: '删除后无法恢复',
      onOk: async () => {
        try {
          await deleteProject(project.id)
          message.success('删除成功')
          onUpdate()
        } catch (error: any) {
          message.error(error.message || '删除失败')
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
      className="group relative h-full cursor-pointer"
      onClick={() => setSelectedProjectId(project.id)}
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
          <div className="line-clamp-2 h-10 text-slate-500">
            {project.description || '暂无描述'}
          </div>
        }
      />
      <div className="mt-4 text-xs text-slate-400">
        {new Date(project.updatedAt).toLocaleString()}
      </div>
    </Card>
  )
}
