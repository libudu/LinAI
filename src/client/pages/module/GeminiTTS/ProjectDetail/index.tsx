import { message, Tabs } from 'antd'
import { hc } from 'hono/client'
import { useState } from 'react'
import type { AppType } from '../../../../../server'
import { TTSProject } from '../../../../../server/module/tts'
import { CharacterList } from './CharacterList'
import { DialogueList } from './DialogueList'
import { VoiceList } from './VoiceList'

const client = hc<AppType>('/')

interface ProjectManagerProps {
  project: TTSProject
}

export const ProjectDetail = ({
  project: initialProject,
}: ProjectManagerProps) => {
  const [project, setProject] = useState(initialProject)

  const updateProjectData = async (
    updates: Partial<Omit<TTSProject, 'id' | 'createdAt'>>,
  ) => {
    try {
      const response = await client.api.tts.projects[':id'].$put({
        param: { id: project.id },
        json: updates,
      })
      const data = await response.json()
      if (data.success) {
        setProject(data.data)
      } else {
        message.error(data.error || '保存失败')
      }
    } catch (error: any) {
      message.error(error.message || '网络错误')
    }
  }

  const handleUpdateCharacters = (characters: any[]) => {
    updateProjectData({ characters })
  }

  return (
    <div className="rounded-xl bg-white p-6 pt-2 shadow-sm">
      <Tabs
        size="large"
        defaultActiveKey="dialogues"
        items={[
          {
            key: 'dialogues',
            label: '对话编排',
            children: (
              <DialogueList
                dialogues={project.dialogues || []}
                characters={project.characters || []}
                onUpdateProject={updateProjectData}
              />
            ),
          },
          {
            key: 'characters',
            label: '人物管理',
            children: (
              <CharacterList
                characters={project.characters || []}
                dialogues={project.dialogues || []}
                onUpdateCharacters={handleUpdateCharacters}
              />
            ),
          },
          {
            key: 'voices',
            label: 'Inworld 音色',
            children: <VoiceList characters={project.characters || []} />,
          },
        ]}
      />
    </div>
  )
}
