import { Col, Row, message } from 'antd'
import { useEffect, useState } from 'react'
import { listProjects, type TTSProjectListItem } from '../service/projects'
import { ProjectCard } from './ProjectCard'

interface ProjectListProps {
  onEditProject: (project: TTSProjectListItem) => void
  refreshTrigger: number
}

export const ProjectList = ({
  onEditProject,
  refreshTrigger,
}: ProjectListProps) => {
  const [projects, setProjects] = useState<TTSProjectListItem[]>([])
  const [loading, setLoading] = useState(false)

  const fetchProjects = async () => {
    setLoading(true)
    try {
      setProjects(await listProjects())
    } catch (error: any) {
      message.error(error.message || '获取项目失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProjects()
  }, [refreshTrigger])

  return (
    <div className="space-y-6">
      <div className={loading ? 'opacity-50' : ''}>
        <Row gutter={[16, 16]}>
          {projects.map((project) => (
            <Col xs={24} sm={12} md={8} lg={6} key={project.id}>
              <ProjectCard
                project={project}
                onUpdate={fetchProjects}
                onEdit={onEditProject}
              />
            </Col>
          ))}
        </Row>
      </div>
    </div>
  )
}
