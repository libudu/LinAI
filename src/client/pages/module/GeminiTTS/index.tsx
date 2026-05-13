import { Button } from 'antd'
import { useState } from 'react'
import { ProjectDetail } from './ProjectDetail'
import { ProjectList } from './ProjectList'
import { ProjectModal } from './ProjectModal'

export const TTS = () => {
  const [selectedProject, setSelectedProject] = useState<any>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<any>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const handleEditProject = (project: any) => {
    setEditingProject(project)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setEditingProject(null)
  }

  const handleModalSuccess = () => {
    setRefreshTrigger((prev) => prev + 1)
  }

  return (
    <div className="h-full">
      <div className="m-0 mb-4 flex items-center justify-between text-2xl font-bold text-slate-800">
        <div>
          {selectedProject === null ? (
            '项目列表'
          ) : (
            <>
              <span
                className="cursor-pointer text-slate-500 transition-colors hover:text-blue-600"
                onClick={() => setSelectedProject(null)}
              >
                项目列表
              </span>
              <span className="mx-2 font-normal text-slate-400">/</span>
              <span>{selectedProject.name}</span>
            </>
          )}
        </div>
        {!selectedProject && (
          <Button type="primary" onClick={() => setIsModalOpen(true)}>
            新增项目
          </Button>
        )}
      </div>
      {selectedProject ? (
        <ProjectDetail project={selectedProject} />
      ) : (
        <ProjectList
          onSelectProject={setSelectedProject}
          onEditProject={handleEditProject}
          refreshTrigger={refreshTrigger}
        />
      )}

      <ProjectModal
        open={isModalOpen}
        editingProject={editingProject}
        onClose={handleCloseModal}
        onSuccess={handleModalSuccess}
      />
    </div>
  )
}
