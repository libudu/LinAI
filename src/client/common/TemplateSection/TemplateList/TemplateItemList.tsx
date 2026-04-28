import { FolderOutlined, InboxOutlined } from '@ant-design/icons'
import { Card, Tooltip, message } from 'antd'
import copy from 'copy-to-clipboard'
import { TaskTemplate } from '../../../../server/common/template-manager'
import { ImageGroup } from './ImageGroup'
import {
  TemplateItemGenerateButtons,
  TemplateItemHeader
} from './TemplateItemHeader'

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
                    <Card
                      key={folder}
                      size="small"
                      className="cursor-pointer shadow-sm transition-shadow hover:border-blue-400 hover:shadow-md"
                      onClick={() => onSelectFolder(folder)}
                    >
                      <div className="flex items-center gap-2">
                        <FolderOutlined className="text-xl text-blue-500" />
                        <div className="min-w-0 flex-1">
                          <div
                            className="truncate font-medium text-slate-700"
                            title={folder}
                          >
                            {folder}
                          </div>
                          <div className="text-xs text-slate-400">
                            {count} 个模板
                          </div>
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}

            {displayTemplates.map((template) => (
              <Card
                key={template.id}
                size="small"
                className="shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex gap-2">
                  <ImageGroup images={template.images || []} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <TemplateItemHeader template={template} />
                    {template.title && (
                      <div
                        className="truncate font-bold text-slate-800"
                        title={template.title}
                      >
                        {template.title}
                      </div>
                    )}
                    <Tooltip title={template.prompt} placement="bottom">
                      <p
                        className="m-0 line-clamp-2 cursor-pointer text-sm text-slate-600 transition-colors hover:text-blue-500"
                        onClick={() => {
                          if (template.prompt) {
                            copy(template.prompt)
                            message.success('提示词已复制')
                          }
                        }}
                      >
                        {template.prompt}
                      </p>
                    </Tooltip>
                    <div className="mt-auto pt-1 text-xs text-slate-400">
                      {new Date(template.createdAt).toLocaleString()}
                    </div>
                    <div className="flex justify-end sm:hidden">
                      <TemplateItemGenerateButtons template={template} />
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
