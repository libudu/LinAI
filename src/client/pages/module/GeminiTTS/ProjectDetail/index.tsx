import { message, Tabs } from 'antd'
import { hc } from 'hono/client'
import { useState } from 'react'
import type { AppType } from '../../../../../server'
import { CharacterList } from './CharacterList'
import { DialogueList } from './DialogueList'
import { VoicePreview } from './VoicePreview'

const client = hc<AppType>('/')

interface ProjectManagerProps {
  project: any
}

export const ProjectDetail = ({
  project: initialProject,
}: ProjectManagerProps) => {
  const [project, setProject] = useState(initialProject)

  const updateProjectData = async (updates: any) => {
    try {
      const response = await client.api['gemini-tts'].projects[':id'].$put({
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

  const handleUpdateDialogues = (dialogues: any[]) => {
    updateProjectData({ dialogues })
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
                onUpdateDialogues={handleUpdateDialogues}
                backgroundPrompt={project.backgroundPrompt || ''}
              />
            ),
          },
          {
            key: 'characters',
            label: '人物管理',
            children: (
              <CharacterList
                characters={project.characters || []}
                onUpdateCharacters={handleUpdateCharacters}
                backgroundPrompt={project.backgroundPrompt || ''}
              />
            ),
          },
          {
            key: 'voice-preview',
            label: '音色试听',
            children: (
              <VoicePreview backgroundPrompt={project.backgroundPrompt || ''} />
            ),
          },
        ]}
      />
    </div>
  )
}
