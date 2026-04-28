import { FolderOutlined } from '@ant-design/icons'
import { Card } from 'antd'

interface TemplateFolderProps {
  folder: string
  count: number
  onClick: () => void
}

export function TemplateFolder({
  folder,
  count,
  onClick
}: TemplateFolderProps) {
  return (
    <Card
      size="small"
      className="cursor-pointer shadow-sm transition-shadow hover:border-blue-400 hover:shadow-md"
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        <FolderOutlined className="text-xl text-blue-500" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-slate-700" title={folder}>
            {folder}
          </div>
          <div className="text-xs text-slate-400">{count} 个模板</div>
        </div>
      </div>
    </Card>
  )
}
