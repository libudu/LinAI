import type { AppType } from '@/server'
import { Button, message } from 'antd'
import { hc } from 'hono/client'
import { useEffect, useState } from 'react'
import { useGlobalStore } from '../../../store/global'
import { ProjectDetail } from './ProjectDetail'
import { ProjectList } from './ProjectList'
import { ProjectModal } from './ProjectModal'
import { useTTSStore } from './store'

const client = hc<AppType>('/')

export const TTS = () => {
  const [selectedProject, setSelectedProject] = useState<any>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<any>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const { ttsInworldApiKey } = useGlobalStore()
  const {
    hasFetchedVoiceList,
    fetchVoiceList,
    selectedProjectId,
    setSelectedProjectId,
  } = useTTSStore()

  useEffect(() => {
    if (ttsInworldApiKey && !hasFetchedVoiceList) {
      fetchVoiceList(ttsInworldApiKey)
    }
  }, [ttsInworldApiKey, hasFetchedVoiceList, fetchVoiceList])

  useEffect(() => {
    if (selectedProjectId) {
      const fetchProject = async () => {
        try {
          const response = await client.api.tts.projects[':id'].$get({
            param: { id: selectedProjectId },
          })
          const data = await response.json()
          if (data.success) {
            setSelectedProject(data.data)
          } else {
            message.error(data.error || '获取项目失败')
            setSelectedProjectId(null)
          }
        } catch (error: any) {
          message.error(error.message || '网络错误')
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
              <span>{selectedProject?.name || '...'}</span>
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
          <ProjectDetail project={selectedProject} />
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
