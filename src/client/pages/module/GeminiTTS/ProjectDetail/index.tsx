import { Button, message, Tabs } from 'antd'
import { hc } from 'hono/client'
import { useState } from 'react'
import type { AppType } from '../../../../../server'
import { CharacterList } from './CharacterList'
import { DialogueList } from './DialogueList'

const client = hc<AppType>('/')

interface ProjectManagerProps {
  project: any
  onBack: () => void
}

export const ProjectDetail = ({
  project: initialProject,
  onBack,
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
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button onClick={onBack}>返回列表</Button>
        <h2 className="text-xl font-bold text-slate-800">{project.name}</h2>
      </div>
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <Tabs
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
                />
              ),
            },
          ]}
        />
      </div>
    </div>
  )
}
