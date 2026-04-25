import { Card, Tooltip } from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import { ImageGroup } from './ImageGroup'
import { TaskTemplate } from '../../../../server/common/template-manager'
import { TemplateItemHeader } from './TemplateItemHeader'

interface TemplateItemListProps {
  filteredTemplates: TaskTemplate[]
}

export function TemplateItemList({ filteredTemplates }: TemplateItemListProps) {
  return (
    <div className="flex flex-col h-full">
      <div
        className="flex-1 overflow-y-auto pr-2"
        style={{ maxHeight: '550px' }}
      >
        {filteredTemplates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-4 border-2 border-dashed border-slate-100 rounded-xl bg-slate-50/50">
            <InboxOutlined className="text-5xl text-slate-300" />
            <p className="text-sm font-medium">该分类下暂无模板内容</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {filteredTemplates.map((template) => (
              <Card
                key={template.id}
                size="small"
                className="shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex gap-4">
                  <ImageGroup images={template.images || []} />
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <TemplateItemHeader template={template} />
                    {template.title && (
                      <div
                        className="font-bold text-slate-800 truncate"
                        title={template.title}
                      >
                        {template.title}
                      </div>
                    )}
                    <Tooltip title={template.prompt} placement="bottom">
                      <p className="text-sm text-slate-600 line-clamp-2 cursor-default m-0">
                        {template.prompt}
                      </p>
                    </Tooltip>
                    <div className="mt-auto text-xs text-slate-400 pt-1">
                      {new Date(template.createdAt).toLocaleString()}
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
