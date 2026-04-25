import { Card } from 'antd'

interface TemplateFolderProps {
  wanCount: number
  geminiCount: number
  onSelect: (source: 'video' | 'image') => void
}

export function TemplateFolder({
  wanCount,
  geminiCount,
  onSelect
}: TemplateFolderProps) {
  return (
    <div className="grid grid-cols-2 gap-4 h-full content-start mt-2">
      <Card
        hoverable
        onClick={() => onSelect('image')}
        className="text-center cursor-pointer border-blue-100 hover:border-blue-300 transition-colors"
      >
        <div className="text-xl font-bold mb-2 text-blue-600">图片</div>
        <div className="text-slate-500">{geminiCount} 个模板</div>
      </Card>
      <Card
        hoverable
        onClick={() => onSelect('video')}
        className="text-center cursor-pointer border-emerald-100 hover:border-emerald-300 transition-colors"
      >
        <div className="text-xl font-bold mb-2 text-emerald-600">视频</div>
        <div className="text-slate-500">{wanCount} 个模板</div>
      </Card>
    </div>
  )
}
