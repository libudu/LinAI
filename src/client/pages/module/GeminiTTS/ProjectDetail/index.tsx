import type { TTSProject } from '@/server/module/tts'
import { message, Tabs } from 'antd'
import { updateProject, type TTSProjectEntity } from '../service/projects'
import { CharacterList } from './CharacterList'
import { DialogueList } from './DialogueList'
import { VoiceList } from './VoiceList'

interface ProjectManagerProps {
  entity: TTSProjectEntity
  onEntityChange: (entity: TTSProjectEntity) => void
}

export const ProjectDetail = ({
  entity,
  onEntityChange,
}: ProjectManagerProps) => {
  const project = entity.value

  // 角色/对白等修改在前端合并后整体保存（携带 revision，冲突时 service 层自动重放一次）
  const updateProjectData = async (
    updates: Partial<Omit<TTSProject, 'id' | 'createdAt'>>,
  ) => {
    try {
      onEntityChange(await updateProject(project.id, updates))
    } catch (error: any) {
      message.error(error.message || '保存失败')
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
                renpyExportDir={project.renpyExportDir}
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
