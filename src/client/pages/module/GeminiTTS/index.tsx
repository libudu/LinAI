import { Button, message } from 'antd'
import { useEffect, useState } from 'react'
import { ProjectDetail } from './ProjectDetail'
import { ProjectList } from './ProjectList'
import { ProjectModal } from './ProjectModal'
import { getProject, type TTSProjectEntity } from './service/projects'
import { useTTSStore } from './store'

export const TTS = () => {
  const [selectedProject, setSelectedProject] =
    useState<TTSProjectEntity | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<any>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const {
    ttsInworldApiKey,
    fetchTTSConfig,
    hasFetchedVoiceList,
    fetchVoiceList,
    selectedProjectId,
    setSelectedProjectId,
  } = useTTSStore()

  useEffect(() => {
    fetchTTSConfig()
  }, [fetchTTSConfig])

  useEffect(() => {
    if (ttsInworldApiKey && !hasFetchedVoiceList) {
      fetchVoiceList()
    }
  }, [ttsInworldApiKey, hasFetchedVoiceList, fetchVoiceList])

  useEffect(() => {
    if (selectedProjectId) {
      const fetchProject = async () => {
        try {
          setSelectedProject(await getProject(selectedProjectId))
        } catch (error: any) {
          message.error(error.message || '获取项目失败')
          setSelectedProjectId(null)
        }
      }
      fetchProject()
    } else {
      setSelectedProject(null)
    }
  }, [selectedProjectId, setSelectedProjectId])

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
          {!selectedProjectId ? (
            '项目列表'
          ) : (
            <>
              <span
                className="cursor-pointer text-slate-500 transition-colors hover:text-blue-600"
                onClick={() => setSelectedProjectId(null)}
              >
                项目列表
              </span>
              <span className="mx-2 font-normal text-slate-400">/</span>
              <span>{selectedProject?.value.name || '...'}</span>
            </>
          )}
        </div>
        {!selectedProjectId && (
          <Button type="primary" onClick={() => setIsModalOpen(true)}>
            新增项目
          </Button>
        )}
      </div>
      {selectedProjectId ? (
        selectedProject ? (
          <ProjectDetail
            key={selectedProject.id}
            entity={selectedProject}
            onEntityChange={setSelectedProject}
          />
        ) : null
      ) : (
        <ProjectList
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
