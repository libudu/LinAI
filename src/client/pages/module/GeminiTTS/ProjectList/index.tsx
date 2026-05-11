import { Col, Row, message } from 'antd'
import { hc } from 'hono/client'
import { useEffect, useState } from 'react'
import type { AppType } from '../../../../../server'
import { ProjectCard } from './ProjectCard'

const client = hc<AppType>('/')

interface ProjectListProps {
  onSelectProject: (project: any) => void
  onEditProject: (project: any) => void
  refreshTrigger: number
}

export const ProjectList = ({
  onSelectProject,
  onEditProject,
  refreshTrigger,
}: ProjectListProps) => {
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

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
  }, [refreshTrigger])

  return (
    <div className="space-y-6">
      <div className={loading ? 'opacity-50' : ''}>
        <Row gutter={[16, 16]}>
          {projects.map((project) => (
            <Col xs={24} sm={12} md={8} lg={6} key={project.id}>
              <ProjectCard
                project={project}
                onSelectProject={onSelectProject}
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
