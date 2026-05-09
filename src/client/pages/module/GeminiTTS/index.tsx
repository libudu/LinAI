import { useState } from 'react'
import { ProjectDetail } from './ProjectDetail'
import { ProjectList } from './ProjectList'

export const GeminiTTS = () => {
  const [selectedProject, setSelectedProject] = useState<any>(null)

  return (
    <div className="h-full">
      {selectedProject ? (
        <ProjectDetail
          project={selectedProject}
          onBack={() => setSelectedProject(null)}
        />
      ) : (
        <ProjectList onSelectProject={setSelectedProject} />
      )}
    </div>
  )
}
