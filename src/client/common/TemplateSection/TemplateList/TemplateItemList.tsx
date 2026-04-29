import { InboxOutlined } from '@ant-design/icons'
import { message } from 'antd'
import { hc } from 'hono/client'
import type { AppType } from '../../../../server'
import { TaskTemplate } from '../../../../server/common/template-manager'
import { useTemplates } from '../../../hooks/useTemplates'
import { TemplateFolder } from '../TemplateItem/TemplateFolder'
import { TemplateItem } from '../TemplateItem/TemplateItem'

const client = hc<AppType>('/')

interface TemplateItemListProps {
  filteredTemplates: TaskTemplate[]
  selectedFolder: string | null
  onSelectFolder: (folder: string | null) => void
}

export function TemplateItemList({
  filteredTemplates,
  selectedFolder,
  onSelectFolder
}: TemplateItemListProps) {
  const { refresh: refreshTemplates } = useTemplates()

  const handleDropTemplate = async (templateId: string, folder: string) => {
    try {
      const res = await client.api.template[':id'].$put({
        param: { id: templateId },
        json: { folder }
      })
      const json = await res.json()
      if (json.success) {
        message.success('已移动到文件夹')
        refreshTemplates()
      } else {
        message.error(json.error || '移动失败')
      }
    } catch (error) {
      message.error('请求失败')
    }
  }

  const folders = Array.from(
    new Set(filteredTemplates.map((t) => t.folder).filter(Boolean))
  ) as string[]

  const displayTemplates = selectedFolder
    ? filteredTemplates.filter((t) => t.folder === selectedFolder)
    : filteredTemplates.filter((t) => !t.folder)

  const displayFolders = selectedFolder
    ? []
    : folders.sort((a, b) => a.localeCompare(b))

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
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
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
