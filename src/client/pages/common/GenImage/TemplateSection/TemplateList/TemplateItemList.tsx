import { FlatTemplate } from '@/shared/image/template'
import { InboxOutlined } from '@ant-design/icons'
import { message } from 'antd'
import { useTemplates } from '../hooks/useTemplates'
import { patchTemplate } from '../../service/templates'
import { TemplateFolder } from '../TemplateItem/TemplateFolder'
import { TemplateItem } from '../TemplateItem/TemplateItem'

interface TemplateItemListProps {
  filteredTemplates: FlatTemplate[]
  selectedFolder: string | null
  onSelectFolder: (folder: string | null) => void
}

export function TemplateItemList({
  filteredTemplates,
  selectedFolder,
  onSelectFolder,
}: TemplateItemListProps) {
  const { refresh: refreshTemplates } = useTemplates()

  const handleDropTemplate = async (templateId: string, folder: string) => {
    const template = filteredTemplates.find((t) => t.id === templateId)
    if (!template) return
    try {
      await patchTemplate(template, { folder })
      message.success('已移动到文件夹')
      refreshTemplates()
    } catch (error) {
      const msg =
        error instanceof Error ? `[网络] ${error.message}` : '移动失败'
      message.error(msg)
    }
  }

  const folders = Array.from(
    new Set(filteredTemplates.map((t) => t.folder).filter(Boolean)),
  ) as string[]

  const displayTemplates = selectedFolder
    ? filteredTemplates.filter((t) => t.folder === selectedFolder)
    : filteredTemplates.filter((t) => !t.folder)

  const displayFolders = selectedFolder
    ? []
    : folders.sort((a, b) => a.localeCompare(b))

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto pr-2">
        {displayFolders.length === 0 && displayTemplates.length === 0 ? (
          <div className="flex flex-col items-center justify-center space-y-4 rounded-xl border-2 border-dashed border-slate-100 bg-slate-50/50 py-12 text-slate-400">
            <InboxOutlined className="text-5xl text-slate-300" />
            <p className="text-sm font-medium">该分类下暂无模板内容</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {displayFolders.length > 0 && (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {displayFolders.map((folder) => {
                  return (
                    <TemplateFolder
                      key={folder}
                      folder={folder}
                      onClick={() => onSelectFolder(folder)}
                      onDropTemplate={handleDropTemplate}
                      onRenameSuccess={() => {
                        refreshTemplates()
                      }}
                    />
                  )
                })}
              </div>
            )}

            {displayTemplates.map((template) => (
              <TemplateItem
                key={template.id}
                template={template}
                draggable={!selectedFolder}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
