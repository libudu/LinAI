import { InboxOutlined } from '@ant-design/icons'
import { TaskTemplate } from '../../../../server/common/template-manager'
import { TemplateFolder } from '../TemplateItem/TemplateFolder'
import { TemplateItem } from '../TemplateItem/TemplateItem'

interface TemplateItemListProps {
  filteredTemplates: TaskTemplate[]
  selectedFolder: string | null
  onSelectFolder: (folder: string) => void
}

export function TemplateItemList({
  filteredTemplates,
  selectedFolder,
  onSelectFolder
}: TemplateItemListProps) {
  const folders = Array.from(
    new Set(filteredTemplates.map((t) => t.folder).filter(Boolean))
  ) as string[]

  const displayTemplates = selectedFolder
    ? filteredTemplates.filter((t) => t.folder === selectedFolder)
    : filteredTemplates.filter((t) => !t.folder)

  const displayFolders = selectedFolder ? [] : folders

  return (
    <div className="flex h-full flex-col">
      <div
        className="flex-1 overflow-y-auto pr-2"
        style={{ maxHeight: '550px' }}
      >
        {displayFolders.length === 0 && displayTemplates.length === 0 ? (
          <div className="flex flex-col items-center justify-center space-y-4 rounded-xl border-2 border-dashed border-slate-100 bg-slate-50/50 py-12 text-slate-400">
            <InboxOutlined className="text-5xl text-slate-300" />
            <p className="text-sm font-medium">该分类下暂无模板内容</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {displayFolders.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {displayFolders.map((folder) => {
                  const count = filteredTemplates.filter(
                    (t) => t.folder === folder
                  ).length
                  return (
                    <TemplateFolder
                      key={folder}
                      folder={folder}
                      count={count}
                      onClick={() => onSelectFolder(folder)}
                    />
                  )
                })}
              </div>
            )}

            {displayTemplates.map((template) => (
              <TemplateItem key={template.id} template={template} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
